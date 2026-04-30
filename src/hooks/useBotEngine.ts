/**
 * useBotEngine — paper-trade engine for signal-follow bots.
 *
 * Watches the live signal stream, opens virtual trades on matching
 * signals, and auto-closes them at the current mark when their hold
 * window expires. Mounted globally in AppShell so it ticks even
 * when the user is not looking at the Bots tab.
 *
 * Phase B1 = paper-only. Live execution waits on Phase 2d.
 */

import { useEffect, useRef } from 'react'
import { useSignals } from './useSignals'
import { useBotStore } from '../store/botStore'
import { getActiveAdapter } from '../adapters/registry'
import type { BotConfig, BotTrade } from '../bots/types'
import type { Signal } from '../signals/types'

const TICK_MS = 5_000
const REVERSAL_MIN_CONFIDENCE = 0.7
const REVERSAL_MIN_HOLD_MS = 2 * 60_000   // 2 min — prevents instant flip-flop

export function useBotEngine(): void {
  const signals = useSignals()
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const recordTrade = useBotStore(s => s.recordTrade)
  const closeTrade = useBotStore(s => s.closeTrade)

  // Track signals already acted on per bot to avoid duplicates if the
  // signal feed re-emits the same id across recompute cycles.
  const actedRef = useRef<Set<string>>(new Set())

  // ─── Open trades on matching signals ───────────────────────────────
  useEffect(() => {
    for (const bot of bots) {
      if (!bot.enabled) continue
      if (bot.mode !== 'paper') continue   // live mode gated on Phase 2d

      const dayAgo = Date.now() - 24 * 60 * 60 * 1000
      const last24h = trades.filter(t => t.botId === bot.id && t.openedAt >= dayAgo).length
      if (last24h >= bot.maxTradesPerDay) continue

      for (const s of signals) {
        if (!matches(bot, s)) continue
        const dedupKey = `${bot.id}:${s.id}`
        if (actedRef.current.has(dedupKey)) continue
        // Already have an open trade for this signal id?
        if (trades.some(t => t.botId === bot.id && t.signalId === s.id && !t.closedAt)) continue

        actedRef.current.add(dedupKey)

        const entryPrice = s.suggestedPrice
        if (entryPrice === undefined || entryPrice <= 0) continue
        const size = bot.positionSizeUsd / entryPrice
        const trade: BotTrade = {
          id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          botId: bot.id,
          signalId: s.id,
          marketId: s.marketId,
          direction: s.direction,
          entryPrice,
          size,
          positionUsd: bot.positionSizeUsd,
          openedAt: Date.now(),
          closeAt: Date.now() + bot.holdMinutes * 60_000,
        }
        recordTrade(trade)
      }
    }
  }, [signals, bots, trades, recordTrade])

  // ─── Close expired trades on a heartbeat ───────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      const adapter = getActiveAdapter()
      for (const t of trades) {
        if (t.closedAt) continue
        if (now < t.closeAt) continue
        const ticker = adapter.getTicker(t.marketId)
        const closePrice = ticker?.price ?? t.entryPrice
        closeTrade(t.id, closePrice, now)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [trades, closeTrade])

  // ─── Early-close on opposing confluence signal ─────────────────────
  //
  // When a high-confidence confluence signal points the opposite way
  // on a market we're already long/short, exit early at the current
  // mark. Saves drawdown on reversals — and the opening-loop above
  // will then ride the new direction if any bot's filter accepts it.
  // The MIN_HOLD guard prevents instant flip-flops on noisy bars.
  useEffect(() => {
    const now = Date.now()
    const adapter = getActiveAdapter()
    for (const t of trades) {
      if (t.closedAt) continue
      if (now - t.openedAt < REVERSAL_MIN_HOLD_MS) continue
      const reversal = signals.find(s =>
        s.source === 'confluence' &&
        s.marketId === t.marketId &&
        s.direction !== t.direction &&
        s.confidence >= REVERSAL_MIN_CONFIDENCE,
      )
      if (!reversal) continue
      const ticker = adapter.getTicker(t.marketId)
      const closePrice = ticker?.price ?? t.entryPrice
      closeTrade(t.id, closePrice, now)
    }
  }, [signals, trades, closeTrade])
}

function matches(bot: BotConfig, signal: Signal): boolean {
  if (signal.confidence < bot.minConfidence) return false
  if (bot.allowedSources.length > 0 && !bot.allowedSources.includes(signal.source)) return false
  if (bot.allowedMarkets.length > 0 && !bot.allowedMarkets.includes(signal.marketId)) return false
  return true
}
