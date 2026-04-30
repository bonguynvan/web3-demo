/**
 * Bot framework types.
 *
 * Phase B1 ships a single mode: paper trading. The bot watches the
 * signal feed, opens virtual positions when a signal matches its
 * filters, and closes them automatically after a hold window so the
 * realized PnL becomes a live track record.
 *
 * Real execution (mode: 'live') depends on Phase 2d wallet trading
 * landing on Hyperliquid first. The same BotConfig shape applies —
 * only the engine's "open trade" branch differs.
 */

import type { SignalDirection, SignalSource } from '../signals/types'

export type BotMode = 'paper' | 'live'

export interface BotConfig {
  id: string
  name: string
  enabled: boolean
  mode: BotMode

  // Filters — empty array means "any"
  allowedSources: SignalSource[]
  allowedMarkets: string[]

  /** 0..1 — only acts on signals at or above this confidence. */
  minConfidence: number

  /** USD notional per trade. */
  positionSizeUsd: number

  /** Hold window before auto-closing at current mark. */
  holdMinutes: number

  /** Hard cap to prevent runaway bots. Counts trades opened in last 24h. */
  maxTradesPerDay: number

  createdAt: number
}

export interface BotTrade {
  id: string
  botId: string
  signalId: string
  marketId: string
  direction: SignalDirection
  entryPrice: number
  /** Base-asset units. */
  size: number
  positionUsd: number
  openedAt: number
  /** Auto-close deadline (entryAt + holdMinutes). */
  closeAt: number
  /** Set when the trade closes. */
  closedAt?: number
  closePrice?: number
  pnlUsd?: number
}

export interface BotStats {
  total: number
  open: number
  closed: number
  wins: number
  losses: number
  winRate: number
  totalPnlUsd: number
  realizedPnlUsd: number
  unrealizedPnlUsd: number
}
