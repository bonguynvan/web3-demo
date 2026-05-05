/**
 * usePositions — STUB.
 *
 * Pre-pivot this read on-chain positions from a PositionManager contract
 * (live mode) or from the synthetic demoPositions array (demo mode).
 * Both data sources are gone: the on-chain DEX is no longer deployed,
 * and the demo array is no longer populated since Web3OrderForm was
 * removed.
 *
 * Workstation surfaces that need positions now read directly from
 * `useBotStore.trades` (open trades) — see PositionsTable, AccountBar.
 * This hook stays as a stub so the few remaining consumers (TradingChart
 * overlay, useLiquidationAlerts) compile without churn while we phase
 * them out.
 */

import { type Address } from 'viem'

export interface OnChainPosition {
  key: string
  market: string
  baseAsset: string
  indexToken: Address
  side: 'long' | 'short'
  size: number
  sizeRaw: bigint
  collateral: number
  collateralRaw: bigint
  entryPrice: number
  entryPriceRaw: bigint
  markPrice: number
  leverage: string
  pnl: number
  pnlPercent: number
  liquidationPrice: number
}

export function usePositions(): { positions: OnChainPosition[] } {
  return { positions: [] }
}
