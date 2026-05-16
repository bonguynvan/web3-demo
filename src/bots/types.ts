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

  /** Stop-loss as a positive percent (e.g. 2 = -2% from entry triggers close).
   *  Undefined or 0 = no stop. Check happens every engine tick. */
  stopLossPct?: number

  /** Take-profit as a positive percent (e.g. 4 = +4% from entry triggers close). */
  takeProfitPct?: number

  /** Trailing stop: lock in gains by closing when PnL falls this many percent
   *  from the trade's peak favorable PnL. Only arms once PnL goes positive. */
  trailingStopPct?: number

  createdAt: number
}

/** Why an open trade was closed. Optional for backward compat — old trades
 *  written before this field existed simply omit it. */
export type BotExitReason =
  | 'hold_expired'   // closeAt elapsed
  | 'stop_loss'      // stopLossPct breached
  | 'take_profit'    // takeProfitPct hit
  | 'trailing_stop'  // pulled back trailingStopPct from peak
  | 'reversal'       // opposing confluence signal fired

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
  /** Mode at the time the trade was opened. Optional for backward compat
   *  with trades persisted before this field existed (treat as 'paper'). */
  mode?: BotMode
  /** Venue order id when mode === 'live'. Lets the UI correlate to
   *  live open orders / fills. */
  venueOrderId?: string
  /** Highest favorable PnL percent observed during the life of the trade.
   *  Updated by the engine on each heartbeat to power the trailing stop. */
  peakPnlPct?: number
  /** Set when the trade closes. */
  closedAt?: number
  closePrice?: number
  pnlUsd?: number
  /** Why this trade closed. Defaults to hold_expired for legacy trades. */
  exitReason?: BotExitReason
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
