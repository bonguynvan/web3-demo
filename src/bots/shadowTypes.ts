/**
 * Shadow bot types — phantom paper variants of a real bot used to
 * answer "what if I had a tighter stop / wider TP / no break-even?".
 *
 * A shadow shares the parent bot's signal feed (same source filters,
 * same markets) but applies parameter OVERRIDES on top of the parent
 * config. Trades land in a separate ShadowTrade ledger so the real
 * bot's stats aren't polluted.
 */

import type { BotTrade } from './types'

/** Subset of BotConfig fields a shadow can override. Keep it tight —
 *  the whole point is parameter variation, not strategy redefinition. */
export interface ShadowOverrides {
  positionSizeUsd?: number
  stopLossPct?: number
  takeProfitPct?: number
  trailingStopPct?: number
  breakEvenAtPct?: number
  holdMinutes?: number
  tp1Pct?: number
  tp1ClosePct?: number
  tp2Pct?: number
}

export interface ShadowBot {
  id: string
  parentBotId: string
  name: string
  enabled: boolean
  overrides: ShadowOverrides
  createdAt: number
}

/** Same shape as BotTrade but lives in its own ledger via shadowId.
 *  Borrows the BotTrade type so the close-loop math is identical. */
export type ShadowTrade = Omit<BotTrade, 'botId'> & {
  shadowId: string
}
