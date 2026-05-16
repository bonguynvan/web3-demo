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
import { useAccount } from 'wagmi'
import { useSignals } from './useSignals'
import { useBotStore } from '../store/botStore'
import { useRiskStore } from '../store/riskStore'
import { getActiveAdapter, getAdapter } from '../adapters/registry'
import { useToast } from '../store/toastStore'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import type { BotConfig, BotTrade, BotExitReason } from '../bots/types'
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
  const updateTradePeak = useBotStore(s => s.updateTradePeak)

  const toast = useToast()
  const vaultUnlocked = useVaultSessionStore(s => s.unlocked)
  const { isConnected: walletConnected } = useAccount()
  const maxExposureUsd = useRiskStore(s => s.maxExposureUsd)
  // Toast at most once per bot per "exposure-blocked" episode so a busy
  // signal feed doesn't spam the user with the same warning every 5s.
  const exposureNotifiedRef = useRef<Set<string>>(new Set())
  // Bots only execute when the user has a real connection — vault
  // unlocked (Binance API key) or wagmi wallet connected. Anonymous
  // visitors can still browse configs, run backtests, and view the
  // panel; we just don't burn cycles opening trades on their behalf.
  const hasConnection = vaultUnlocked || walletConnected
  // Track signals already acted on per bot to avoid duplicates if the
  // signal feed re-emits the same id across recompute cycles.
  const actedRef = useRef<Set<string>>(new Set())
  // Bots that have already had a daily-cap toast fired today (resets on
  // each fresh midnight tick because last24h naturally drops).
  const cappedNotifiedRef = useRef<Set<string>>(new Set())

  // ─── Open trades on matching signals ───────────────────────────────
  useEffect(() => {
    if (!hasConnection) return
    for (const bot of bots) {
      if (!bot.enabled) continue

      const dayAgo = Date.now() - 24 * 60 * 60 * 1000
      const last24h = trades.filter(t => t.botId === bot.id && t.openedAt >= dayAgo).length
      if (last24h >= bot.maxTradesPerDay) {
        if (!cappedNotifiedRef.current.has(bot.id)) {
          cappedNotifiedRef.current.add(bot.id)
          toast.warning(`${bot.name} hit daily cap`, `${last24h}/${bot.maxTradesPerDay} trades — paused until trades age out`)
        }
        continue
      } else {
        cappedNotifiedRef.current.delete(bot.id)
      }

      for (const s of signals) {
        if (!matches(bot, s)) continue
        const dedupKey = `${bot.id}:${s.id}`
        if (actedRef.current.has(dedupKey)) continue
        if (trades.some(t => t.botId === bot.id && t.signalId === s.id && !t.closedAt)) continue

        const entryPrice = s.suggestedPrice
        if (entryPrice === undefined || entryPrice <= 0) continue
        const size = bot.positionSizeUsd / entryPrice

        // Exposure cap pre-check. Without this the bot would open the
        // trade and useRiskMonitor would *then* detect the breach and
        // pause everything — leaving an oversized position open. By
        // gating before recordTrade we keep total exposure under the cap.
        if (maxExposureUsd > 0) {
          const currentExposure = trades
            .filter(t => t.closedAt === undefined)
            .reduce((acc, t) => acc + t.positionUsd, 0)
          if (currentExposure + bot.positionSizeUsd > maxExposureUsd) {
            if (!exposureNotifiedRef.current.has(bot.id)) {
              exposureNotifiedRef.current.add(bot.id)
              toast.warning(
                `${bot.name} skipped — exposure cap`,
                `Open $${currentExposure.toFixed(0)} + $${bot.positionSizeUsd} would exceed cap $${maxExposureUsd}`,
              )
            }
            continue
          } else {
            // Headroom restored — let future blocks toast again.
            exposureNotifiedRef.current.delete(bot.id)
          }
        }

        if (bot.mode === 'live') {
          // Live mode hard guards. Any failure → fall through and skip
          // this signal cycle. Bot stays in live mode but takes no action
          // until the operator fixes the underlying condition.
          if (!vaultUnlocked) continue
          const adapter = getAdapter('binance')
          const isAuthed = adapter && typeof (adapter as unknown as { isAuthenticated?: () => boolean }).isAuthenticated === 'function'
            && (adapter as unknown as { isAuthenticated: () => boolean }).isAuthenticated()
          if (!adapter || !isAuthed) continue
          if (!adapter.capabilities.trading) continue

          actedRef.current.add(dedupKey)
          // Place the order. We don't block the loop on the signed POST —
          // do it async, log the trade once we have an order id back.
          ;(async () => {
            try {
              const placed = await adapter.placeOrder({
                marketId: s.marketId,
                side: s.direction === 'long' ? 'buy' : 'sell',
                type: 'limit',
                tif: 'gtc',
                size,
                price: entryPrice,
              })
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
                mode: 'live',
                venueOrderId: placed.id,
              }
              recordTrade(trade)
              toast.success(`${bot.name} placed live order`, `${s.marketId} ${s.direction} · order ${placed.id}`)
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Unknown error'
              toast.error(`${bot.name} live order failed`, msg)
              // Allow retry next cycle.
              actedRef.current.delete(dedupKey)
            }
          })()
        } else {
          actedRef.current.add(dedupKey)
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
    }
  }, [signals, bots, trades, recordTrade, vaultUnlocked, walletConnected, hasConnection, maxExposureUsd, toast])

  // ─── Risk-aware close loop ─────────────────────────────────────────
  //
  // Every tick we evaluate each open trade against — in this priority order:
  //   1. stop_loss   — pnlPct ≤ -bot.stopLossPct          (hard floor)
  //   2. take_profit — pnlPct ≥  bot.takeProfitPct        (lock the win)
  //   3. trailing    — pnlPct ≤ peakPnlPct − bot.trailingStopPct
  //                    (only armed once pnlPct has been positive)
  //   4. hold_expired — now ≥ t.closeAt                   (existing fallback)
  //
  // If none fire, we still update peakPnlPct so trailing has a value to
  // compare against on the next tick. This is the only mutation in the
  // non-exit branch, so the store stays quiet when nothing's happening.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      const adapter = getActiveAdapter()
      for (const t of trades) {
        if (t.closedAt) continue
        const ticker = adapter.getTicker(t.marketId)
        const mark = ticker?.price ?? t.entryPrice
        const sign = t.direction === 'long' ? 1 : -1
        // pnlPct of the position relative to entry (NOT account equity).
        const pnlPct = t.entryPrice > 0
          ? (sign * (mark - t.entryPrice) / t.entryPrice) * 100
          : 0
        const bot = bots.find(b => b.id === t.botId)
        const sl = bot?.stopLossPct ?? 0
        const tp = bot?.takeProfitPct ?? 0
        const trail = bot?.trailingStopPct ?? 0

        let exitReason: BotExitReason | null = null
        if (sl > 0 && pnlPct <= -sl) exitReason = 'stop_loss'
        else if (tp > 0 && pnlPct >= tp) exitReason = 'take_profit'
        else if (trail > 0) {
          const peak = t.peakPnlPct ?? 0
          if (peak > 0 && pnlPct <= peak - trail) exitReason = 'trailing_stop'
        }
        if (!exitReason && now >= t.closeAt) exitReason = 'hold_expired'

        if (!exitReason) {
          if (pnlPct > (t.peakPnlPct ?? -Infinity)) {
            updateTradePeak(t.id, pnlPct)
          }
          continue
        }

        // Live trade with a known venue order id: best-effort cancel of
        // the still-resting limit before we mark the trade closed locally.
        if (t.mode === 'live' && t.venueOrderId) {
          const a = getAdapter('binance')
          if (a) {
            void a.cancelOrder({ marketId: t.marketId, orderId: t.venueOrderId }).catch(() => { /* swallow */ })
          }
        }
        closeTrade(t.id, mark, now, exitReason)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [trades, bots, closeTrade, updateTradePeak])

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
      closeTrade(t.id, closePrice, now, 'reversal')
    }
  }, [signals, trades, closeTrade])
}

function matches(bot: BotConfig, signal: Signal): boolean {
  if (signal.confidence < bot.minConfidence) return false
  if (bot.allowedSources.length > 0 && !bot.allowedSources.includes(signal.source)) return false
  if (bot.allowedMarkets.length > 0 && !bot.allowedMarkets.includes(signal.marketId)) return false
  return true
}
