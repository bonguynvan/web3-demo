/**
 * botHealth — detects when a paper bot's recent performance has
 * drifted away from its all-time baseline.
 *
 * The "drift" state fires when ALL of:
 *   - the bot has ≥ MIN_TOTAL resolved trades (otherwise sample is meaningless)
 *   - all-time win rate ≥ MIN_BASELINE_WR (we only care about previously-good bots)
 *   - recent (last WINDOW) win rate is at least MIN_DROP_PP below all-time
 *
 * Surfaced two ways:
 *   - small inline badge on BotCard (always visible)
 *   - one-shot toast via useBotDriftDetector when first crossed
 */

import type { BotConfig, BotTrade } from '../bots/types'

const MIN_TOTAL = 15
const WINDOW = 20
const MIN_BASELINE_WR = 0.5
const MIN_DROP_PP = 0.15 // 15 percentage points

export type BotHealthState = 'unknown' | 'healthy' | 'drift'

export interface BotHealth {
  state: BotHealthState
  allTimeWR: number
  recentWR: number
  sample: number       // total resolved trades
  windowSize: number   // how many trades the recent WR is computed over
}

export function computeBotHealth(bot: BotConfig, trades: BotTrade[]): BotHealth {
  const resolved = trades
    .filter(t => t.botId === bot.id && t.closedAt !== undefined && t.pnlUsd !== undefined)
    .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))

  if (resolved.length < MIN_TOTAL) {
    return { state: 'unknown', allTimeWR: 0, recentWR: 0, sample: resolved.length, windowSize: 0 }
  }

  const wins = resolved.filter(t => (t.pnlUsd ?? 0) > 0).length
  const allTimeWR = wins / resolved.length

  const window = resolved.slice(-WINDOW)
  const winsRecent = window.filter(t => (t.pnlUsd ?? 0) > 0).length
  const recentWR = winsRecent / window.length

  const drifted = allTimeWR >= MIN_BASELINE_WR && allTimeWR - recentWR >= MIN_DROP_PP
  return {
    state: drifted ? 'drift' : 'healthy',
    allTimeWR,
    recentWR,
    sample: resolved.length,
    windowSize: window.length,
  }
}
