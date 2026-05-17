/**
 * useAutoPauseDegradation — pause bots whose recent performance
 * crosses a stricter degradation threshold than the drift detector.
 *
 * The drift detector (useBotDriftDetector) toasts on a light signal:
 * 20pp recent-vs-all-time win-rate drop. Useful but soft. This hook
 * is the heavy hammer: if the recent window is BOTH below the win
 * threshold AND the realized PnL is negative AND the sample is large
 * enough, auto-pause the bot.
 *
 * Dedup via localStorage so a refresh doesn't re-pause an already-
 * paused bot. The set auto-clears when the bot is re-enabled by the
 * user manually after tuning.
 */

import { useEffect } from 'react'
import { useBotStore } from '../store/botStore'
import { useToastStore } from '../store/toastStore'

const STORAGE_KEY = 'tc-autopause-v1'
const WINDOW = 15            // last N closed trades
const MIN_SAMPLE = 10        // need enough trades to be confident
const MAX_WIN_RATE = 0.4     // pause if recent WR <= 40%
const REQUIRE_NEGATIVE_PNL = true

function loadAlerted(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? new Set(arr.filter(x => typeof x === 'string') as string[]) : new Set()
  } catch { return new Set() }
}

function persistAlerted(s: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s))) } catch { /* full */ }
}

export function useAutoPauseDegradation(): void {
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const toggleBot = useBotStore(s => s.toggleBot)
  const addToast = useToastStore(s => s.add)

  useEffect(() => {
    if (bots.length === 0 || trades.length === 0) return
    const alerted = loadAlerted()
    let changed = false

    for (const bot of bots) {
      // Once the user re-enables a paused bot, clear it from the alerted
      // set so a future degradation event can re-pause it.
      if (bot.enabled && alerted.has(bot.id)) {
        alerted.delete(bot.id)
        changed = true
      }
      if (!bot.enabled) continue
      if (alerted.has(bot.id)) continue

      const resolved = trades
        .filter(t => t.botId === bot.id && t.closedAt !== undefined && t.pnlUsd !== undefined)
        .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))
      if (resolved.length < MIN_SAMPLE) continue

      const recent = resolved.slice(-WINDOW)
      const wins = recent.filter(t => (t.pnlUsd ?? 0) > 0).length
      const recentWR = wins / recent.length
      const recentPnl = recent.reduce((s, t) => s + (t.pnlUsd ?? 0), 0)

      const pnlBad = REQUIRE_NEGATIVE_PNL ? recentPnl < 0 : true
      const wrBad = recentWR <= MAX_WIN_RATE

      if (!pnlBad || !wrBad) continue

      // Trip the brakes: disable the bot, mark as alerted, toast.
      toggleBot(bot.id)
      alerted.add(bot.id)
      changed = true
      addToast(
        'error',
        `⛔ ${bot.name} auto-paused`,
        `Recent ${recent.length} trades: ${Math.round(recentWR * 100)}% win · ${recentPnl >= 0 ? '+' : ''}$${recentPnl.toFixed(2)}. Tune or fork before re-enabling.`,
        14_000,
      )
    }
    if (changed) persistAlerted(alerted)
  }, [bots, trades, toggleBot, addToast])
}
