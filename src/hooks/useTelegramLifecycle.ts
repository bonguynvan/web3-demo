/**
 * useTelegramLifecycle — sends Telegram messages on trade lifecycle
 * events.
 *
 * Watches botStore.trades + riskStore.breach for state transitions:
 *   - Trade opens               → "🟢 BOT placed ETH-PERP long @ 3450"
 *   - TP1 partial fires         → "📈 TP1 hit · 50% closed · +$12.34"
 *   - Break-even arms           → "🛡️ BE armed on BOT @ ETH-PERP"
 *   - Trade closes (any reason) → "🔴 BOT exited ETH-PERP · -$8.20 (stop_loss)"
 *   - Risk cap breach           → "⚠️ Risk cap breached — bots paused: <reason>"
 *
 * Opt-in via TelegramConfig.lifecycleAlerts. The existing
 * useTelegramAlerts hook handles signal alerts independently.
 *
 * Detection uses a ref-tracked snapshot of trade ids + flag states;
 * deduplication happens by storing the last-seen state for each trade.
 */

import { useEffect, useRef } from 'react'
import { useBotStore } from '../store/botStore'
import { useRiskStore } from '../store/riskStore'
import {
  loadTelegramConfig,
  sendTelegramMessage,
  TELEGRAM_CONFIG_EVENT,
  type TelegramConfig,
} from '../lib/telegram'
import type { BotTrade, BotConfig } from '../bots/types'

interface TradeSnapshot {
  tp1Hit: boolean
  slMovedToBreakEven: boolean
  closed: boolean
}

export function useTelegramLifecycle(): void {
  const trades = useBotStore(s => s.trades)
  const bots = useBotStore(s => s.bots)
  const breach = useRiskStore(s => s.breach)

  const configRef = useRef<TelegramConfig>(loadTelegramConfig())
  // Per-trade state we've already announced. Initialized empty so the
  // first effect pass primes the snapshot without firing for existing
  // trades (avoids a spam dump when the user enables the feature).
  const snapshotRef = useRef<Map<string, TradeSnapshot>>(new Map())
  const primedRef = useRef(false)
  const lastBreachIdRef = useRef<number | null>(null)

  useEffect(() => {
    const sync = () => { configRef.current = loadTelegramConfig() }
    sync()
    window.addEventListener(TELEGRAM_CONFIG_EVENT, sync)
    return () => window.removeEventListener(TELEGRAM_CONFIG_EVENT, sync)
  }, [])

  useEffect(() => {
    const cfg = configRef.current
    // The user could have signals off but lifecycle on. Only check
    // lifecycleAlerts here, not the `enabled` master.
    if (!cfg.lifecycleAlerts || !cfg.botToken || !cfg.chatId) {
      // Keep snapshot fresh so re-enabling doesn't spam the user.
      snapshotRef.current = buildSnapshot(trades)
      primedRef.current = true
      return
    }
    const botById = new Map(bots.map(b => [b.id, b]))

    // First pass: prime without sending.
    if (!primedRef.current) {
      snapshotRef.current = buildSnapshot(trades)
      primedRef.current = true
      return
    }

    const next = new Map<string, TradeSnapshot>()
    for (const t of trades) {
      const snap: TradeSnapshot = {
        tp1Hit: !!t.tp1Hit,
        slMovedToBreakEven: !!t.slMovedToBreakEven,
        closed: !!t.closedAt,
      }
      const prior = snapshotRef.current.get(t.id)
      next.set(t.id, snap)

      // Trade just appeared (no prior snapshot, not closed at first sight) → open.
      if (!prior && !snap.closed) {
        void sendTelegramMessage(cfg.botToken, cfg.chatId, fmtOpen(t, botById.get(t.botId)))
        continue
      }
      if (!prior) continue
      // Detect transitions on existing trades.
      if (!prior.tp1Hit && snap.tp1Hit) {
        void sendTelegramMessage(cfg.botToken, cfg.chatId, fmtTp1(t, botById.get(t.botId)))
      }
      if (!prior.slMovedToBreakEven && snap.slMovedToBreakEven) {
        void sendTelegramMessage(cfg.botToken, cfg.chatId, fmtBeArmed(t, botById.get(t.botId)))
      }
      if (!prior.closed && snap.closed) {
        void sendTelegramMessage(cfg.botToken, cfg.chatId, fmtClose(t, botById.get(t.botId)))
      }
    }
    snapshotRef.current = next
  }, [trades, bots])

  // Risk-cap breach. New breach → fire; same breach → skip.
  useEffect(() => {
    const cfg = configRef.current
    if (!cfg.lifecycleAlerts || !cfg.botToken || !cfg.chatId) return
    if (!breach) {
      lastBreachIdRef.current = null
      return
    }
    if (lastBreachIdRef.current === breach.at) return
    lastBreachIdRef.current = breach.at
    void sendTelegramMessage(cfg.botToken, cfg.chatId,
      `⚠️ Risk cap breached — bots paused\n${breach.reason}`)
  }, [breach])
}

function buildSnapshot(trades: BotTrade[]): Map<string, TradeSnapshot> {
  const m = new Map<string, TradeSnapshot>()
  for (const t of trades) {
    m.set(t.id, {
      tp1Hit: !!t.tp1Hit,
      slMovedToBreakEven: !!t.slMovedToBreakEven,
      closed: !!t.closedAt,
    })
  }
  return m
}

function fmtOpen(t: BotTrade, b: BotConfig | undefined): string {
  const arrow = t.direction === 'long' ? '🟢↗' : '🔴↘'
  return [
    `${arrow} ${b?.name ?? 'Bot'} opened ${t.marketId}`,
    `${t.direction.toUpperCase()} ${t.size.toFixed(6)} @ ${t.entryPrice.toFixed(4)}`,
    `Size: $${t.positionUsd.toFixed(2)}${t.mode === 'live' ? ' (LIVE)' : ' (paper)'}`,
  ].join('\n')
}

function fmtTp1(t: BotTrade, b: BotConfig | undefined): string {
  const partial = t.tp1ClosedPnlUsd ?? 0
  const sign = partial >= 0 ? '+' : ''
  return [
    `📈 TP1 hit on ${b?.name ?? 'Bot'} · ${t.marketId}`,
    `Partial close: ${sign}$${partial.toFixed(2)}`,
    `Runner: ${t.size.toFixed(6)} @ ${t.entryPrice.toFixed(4)}`,
  ].join('\n')
}

function fmtBeArmed(t: BotTrade, b: BotConfig | undefined): string {
  return [
    `🛡️ Break-even armed on ${b?.name ?? 'Bot'} · ${t.marketId}`,
    `Stop moved to entry @ ${t.entryPrice.toFixed(4)} — trade is risk-free.`,
  ].join('\n')
}

function fmtClose(t: BotTrade, b: BotConfig | undefined): string {
  const pnl = t.pnlUsd ?? 0
  const sign = pnl >= 0 ? '+' : ''
  const icon = pnl > 0 ? '✅' : pnl < 0 ? '❌' : '⚪'
  const reason = (t.exitReason ?? 'hold_expired').replace('_', ' ')
  return [
    `${icon} ${b?.name ?? 'Bot'} exited ${t.marketId}`,
    `${sign}$${pnl.toFixed(2)} · ${reason}`,
    `Entry ${t.entryPrice.toFixed(4)} → close ${(t.closePrice ?? 0).toFixed(4)}`,
  ].join('\n')
}
