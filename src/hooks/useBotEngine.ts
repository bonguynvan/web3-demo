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
import { getActiveAdapter, getAdapter } from '../adapters/registry'
import { useToast } from '../store/toastStore'
import { useVaultSessionStore } from '../store/vaultSessionStore'
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

  const toast = useToast()
  const vaultUnlocked = useVaultSessionStore(s => s.unlocked)
  // Track signals already acted on per bot to avoid duplicates if the
  // signal feed re-emits the same id across recompute cycles.
  const actedRef = useRef<Set<string>>(new Set())
  // Bots that have already had a daily-cap toast fired today (resets on
  // each fresh midnight tick because last24h naturally drops).
  const cappedNotifiedRef = useRef<Set<string>>(new Set())

  // ─── Open trades on matching signals ───────────────────────────────
  useEffect(() => {
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

        if (bot.mode === 'live') {
          // Live mode hard guards. Any failure → fall through and skip
          // this signal cycle. Bot stays in live mode but takes no action
          // until the operator fixes the underlying condition.
          if (!vaultUnlocked) continue
          const adapter = getAdapter('binance')
          const isAuthed = adapter && typeof (adapter as { isAuthenticated?: () => boolean }).isAuthenticated === 'function'
            && (adapter as { isAuthenticated: () => boolean }).isAuthenticated()
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
  }, [signals, bots, trades, recordTrade, vaultUnlocked, toast])

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
