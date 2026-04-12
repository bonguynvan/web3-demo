/**
 * Futures with expiry types — dated futures positions that auto-settle.
 *
 * Futures are perp positions with an expiry timestamp attached.
 * Settlement happens client-side at expiry using the current mark price.
 */

import type { OrderSide } from './trading'

/** Standard tenor periods. */
export type FuturesTenor = '1W' | '2W' | '1M' | '3M'

/** A futures contract definition (tenor + expiry). */
export interface FuturesContract {
  symbol: string
  baseAsset: string
  tenor: FuturesTenor
  expiryTimestamp: number
  /** Annualized basis rate at current prices (e.g., 0.05 = 5%). */
  annualizedBasis: number
}

/** An open or settled futures position. */
export interface FuturesPosition {
  id: string
  market: string
  baseAsset: string
  side: OrderSide
  size: number
  collateral: number
  entryPrice: number
  markPrice: number
  leverage: number
  liquidationPrice: number
  pnl: number
  pnlPercent: number
  tenor: FuturesTenor
  expiryTimestamp: number
  openedAt: number
  basisRateAtEntry: number
  isSettled: boolean
  settlementPrice: number | null
  openFee: number
}

/** Record of a settled futures position (for history). */
export interface FuturesSettlementRecord {
  id: string
  market: string
  side: OrderSide
  size: number
  entryPrice: number
  settlementPrice: number
  pnl: number
  fee: number
  tenor: FuturesTenor
  openedAt: number
  settledAt: number
}
