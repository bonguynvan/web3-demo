/**
 * useProfitableBotDetector — fires a celebratory toast the first time
 * one of the user's paper bots crosses the "earned its keep" line:
 * ≥ MIN_TRADES resolved trades AND winRate ≥ MIN_WIN_RATE.
 *
 * Outcome-gated upsell: this is the exact moment to nudge the user
 * toward Pro features. The toast is positive ("Your bot is profitable
 * — flip on alerts?"), tied to a specific bot by name, and only
 * fires once per bot (persisted in localStorage so a reload doesn't
 * replay it).
 *
 * The companion ShipResultsBanner shows the same nudge at the page
 * level for users who missed the toast; this hook adds a
 * contextual, per-bot celebration on top.
 */

import { useEffect } from 'react'
import { useBotStore } from '../store/botStore'
import { useToastStore } from '../store/toastStore'
import { useAuthStore } from '../store/authStore'
import { useEntitlementStore } from '../store/entitlementStore'
import { apiAvailable } from '../api/client'
import { deriveProState } from '../lib/pro'

const STORAGE_KEY = 'tc-bot-celebrated-v1'
const MIN_TRADES = 10
const MIN_WIN_RATE = 0.5

function loadCelebrated(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? new Set(arr.filter(x => typeof x === 'string') as string[]) : new Set()
  } catch { return new Set() }
}

function persistCelebrated(s: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s))) } catch { /* full */ }
}

export function useProfitableBotDetector(): void {
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const addToast = useToastStore(s => s.add)
  const token = useAuthStore(s => s.token)
  const me = useEntitlementStore(s => s.data)

  useEffect(() => {
    if (bots.length === 0 || trades.length === 0) return

    // Skip celebrations for users who are already Pro — they don't need
    // the upsell. Local-dev users (no backend) still see it for testing.
    const gateActive = apiAvailable() && !!token
    const isPro = gateActive && deriveProState(me).active
    if (isPro) return

    const celebrated = loadCelebrated()
    let changed = false

    for (const bot of bots) {
      if (celebrated.has(bot.id)) continue
      const botTrades = trades.filter(t =>
        t.botId === bot.id && t.closedAt !== undefined && t.pnlUsd !== undefined
      )
      if (botTrades.length < MIN_TRADES) continue
      const wins = botTrades.filter(t => (t.pnlUsd ?? 0) > 0).length
      const winRate = wins / botTrades.length
      if (winRate < MIN_WIN_RATE) continue

      const pct = Math.round(winRate * 100)
      addToast(
        'success',
        `🎯 ${bot.name} is profitable`,
        `${pct}% hit rate across ${botTrades.length} trades. Ready to flip on Telegram alerts?`,
        12_000,
      )
      celebrated.add(bot.id)
      changed = true
    }
    if (changed) persistCelebrated(celebrated)
  }, [bots, trades, addToast, token, me])
}
