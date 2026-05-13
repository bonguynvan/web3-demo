/**
 * useBotDriftDetector — one-shot toast the first time a previously-
 * healthy bot crosses into drift state (see lib/botHealth).
 *
 * Per-bot, dedup'd via localStorage so a reload doesn't re-fire.
 * Auto-clears the dedup entry when a bot recovers, so a future
 * drift event for the same bot fires again.
 */

import { useEffect } from 'react'
import { useBotStore } from '../store/botStore'
import { useToastStore } from '../store/toastStore'
import { computeBotHealth } from '../lib/botHealth'

const STORAGE_KEY = 'tc-bot-drift-v1'

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

export function useBotDriftDetector(): void {
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const addToast = useToastStore(s => s.add)

  useEffect(() => {
    if (bots.length === 0 || trades.length === 0) return
    const alerted = loadAlerted()
    let changed = false

    for (const bot of bots) {
      const h = computeBotHealth(bot, trades)
      if (h.state !== 'drift') {
        if (alerted.has(bot.id)) {
          alerted.delete(bot.id)
          changed = true
        }
        continue
      }
      if (alerted.has(bot.id)) continue

      const allTime = Math.round(h.allTimeWR * 100)
      const recent = Math.round(h.recentWR * 100)
      addToast(
        'warning',
        `⚠️ ${bot.name} performance is slipping`,
        `Recent win rate ${recent}% (last ${h.windowSize}) vs ${allTime}% all-time. Review entry rules or pause.`,
        12_000,
      )
      alerted.add(bot.id)
      changed = true
    }
    if (changed) persistAlerted(alerted)
  }, [bots, trades, addToast])
}
