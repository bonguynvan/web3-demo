/**
 * useShadowEngine — runs phantom variants of real bots in parallel.
 *
 * On every signal that matches a parent bot, fans out to that bot's
 * active shadows. Each shadow opens its own ShadowTrade with the
 * parent config + overrides applied. The close loop mirrors
 * useBotEngine (SL / BE / TP / trailing / hold-expired) using the
 * overridden parameters where set.
 *
 * Shadows are always paper — they never touch venue APIs.
 *
 * Intentional simplifications vs useBotEngine:
 *   - No live mode (paper only)
 *   - No exposure cap (shadows are simulated, no real risk)
 *   - No reversal-close path (matches the parent already)
 *   - Skip max-trades-per-day check (shadows are samples for analysis)
 */

import { useEffect, useRef, useState } from 'react'
import { useBotStore } from '../store/botStore'
import { useShadowStore } from '../store/shadowStore'
import { useSignals } from './useSignals'
import { getActiveAdapter } from '../adapters/registry'
import type { BotConfig, BotExitReason } from '../bots/types'
import type { ShadowBot, ShadowTrade } from '../bots/shadowTypes'
import type { Signal } from '../signals/types'

const TICK_MS = 10_000

export function useShadowEngine(): void {
  const signals = useSignals()
  const bots = useBotStore(s => s.bots)
  const shadows = useShadowStore(s => s.shadows)
  const trades = useShadowStore(s => s.trades)
  const recordTrade = useShadowStore(s => s.recordShadowTrade)
  const closeTrade = useShadowStore(s => s.closeShadowTrade)
  const updateTradePeak = useShadowStore(s => s.updateShadowTradePeak)
  const markSlMovedToBreakEven = useShadowStore(s => s.markShadowSlMovedToBreakEven)

  // Dedup actedOn — same shape as the real engine.
  const actedRef = useRef<Set<string>>(new Set())

  // ── Open path ──────────────────────────────────────────────────────
  useEffect(() => {
    if (shadows.length === 0) return
    const botById = new Map(bots.map(b => [b.id, b]))
    for (const shadow of shadows) {
      if (!shadow.enabled) continue
      const parent = botById.get(shadow.parentBotId)
      if (!parent) continue
      const effective = applyOverrides(parent, shadow)

      for (const s of signals) {
        if (!matches(effective, s)) continue
        const dedupKey = `${shadow.id}:${s.id}`
        if (actedRef.current.has(dedupKey)) continue
        if (trades.some(t => t.shadowId === shadow.id && t.signalId === s.id && !t.closedAt)) continue

        const entryPrice = s.suggestedPrice
        if (entryPrice === undefined || entryPrice <= 0) continue
        const notional = effective.positionSizeUsd
        const size = notional / entryPrice

        actedRef.current.add(dedupKey)
        const trade: ShadowTrade = {
          id: `shtrade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          shadowId: shadow.id,
          signalId: s.id,
          marketId: s.marketId,
          direction: s.direction,
          entryPrice,
          size,
          positionUsd: notional,
          openedAt: Date.now(),
          closeAt: Date.now() + effective.holdMinutes * 60_000,
          mode: 'paper',
        }
        recordTrade(trade)
      }
    }
  }, [signals, shadows, bots, trades, recordTrade])

  // ── Close loop ─────────────────────────────────────────────────────
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (shadows.length === 0) return
    const id = setInterval(() => {
      const now = Date.now()
      const adapter = getActiveAdapter()
      const botById = new Map(bots.map(b => [b.id, b]))
      const shadowById = new Map(shadows.map(s => [s.id, s]))

      for (const t of trades) {
        if (t.closedAt) continue
        const shadow = shadowById.get(t.shadowId)
        if (!shadow) continue
        const parent = botById.get(shadow.parentBotId)
        if (!parent) continue
        const effective = applyOverrides(parent, shadow)

        const ticker = adapter.getTicker(t.marketId)
        const mark = ticker?.price ?? t.entryPrice
        const sign = t.direction === 'long' ? 1 : -1
        const pnlPct = t.entryPrice > 0
          ? (sign * (mark - t.entryPrice) / t.entryPrice) * 100
          : 0

        const sl = effective.stopLossPct ?? 0
        const tp = effective.tp2Pct ?? effective.takeProfitPct ?? 0
        const trail = effective.trailingStopPct ?? 0
        const breakEven = effective.breakEvenAtPct ?? 0
        const slFloor = t.slMovedToBreakEven ? 0 : -sl

        let exitReason: BotExitReason | null = null
        if (sl > 0 && pnlPct <= slFloor) {
          exitReason = t.slMovedToBreakEven ? 'break_even' : 'stop_loss'
        }
        else if (tp > 0 && pnlPct >= tp) exitReason = 'take_profit'
        else if (trail > 0) {
          const peak = t.peakPnlPct ?? 0
          if (peak > 0 && pnlPct <= peak - trail) exitReason = 'trailing_stop'
        }
        if (!exitReason && now >= t.closeAt) exitReason = 'hold_expired'

        if (!exitReason) {
          if (breakEven > 0 && !t.slMovedToBreakEven && pnlPct >= breakEven) {
            markSlMovedToBreakEven(t.id)
          }
          if (pnlPct > (t.peakPnlPct ?? -Infinity)) {
            updateTradePeak(t.id, pnlPct)
          }
          continue
        }
        closeTrade(t.id, mark, now, exitReason)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [trades, bots, shadows, closeTrade, updateTradePeak, markSlMovedToBreakEven])
}

/** Returns the parent config with any shadow override applied. */
function applyOverrides(parent: BotConfig, shadow: ShadowBot): BotConfig {
  const o = shadow.overrides
  return {
    ...parent,
    positionSizeUsd: o.positionSizeUsd ?? parent.positionSizeUsd,
    stopLossPct: o.stopLossPct ?? parent.stopLossPct,
    takeProfitPct: o.takeProfitPct ?? parent.takeProfitPct,
    trailingStopPct: o.trailingStopPct ?? parent.trailingStopPct,
    breakEvenAtPct: o.breakEvenAtPct ?? parent.breakEvenAtPct,
    holdMinutes: o.holdMinutes ?? parent.holdMinutes,
    tp1Pct: o.tp1Pct ?? parent.tp1Pct,
    tp1ClosePct: o.tp1ClosePct ?? parent.tp1ClosePct,
    tp2Pct: o.tp2Pct ?? parent.tp2Pct,
  }
}

function matches(bot: BotConfig, signal: Signal): boolean {
  if (signal.confidence < bot.minConfidence) return false
  if (bot.allowedSources.length > 0 && !bot.allowedSources.includes(signal.source)) return false
  if (bot.allowedMarkets.length > 0 && !bot.allowedMarkets.includes(signal.marketId)) return false
  return true
}
