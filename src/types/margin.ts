/**
 * Margin trading types — Aave V3 lending/borrowing on Arbitrum.
 *
 * Separate from trading.ts (perp) and spot.ts to keep concerns isolated.
 */

import type { Address } from 'viem'
import type { Token } from './spot'

// Re-export Token for convenience
export type { Token }

/** Per-asset Aave position data for the connected user. */
export interface AaveUserReserve {
  asset: Token
  /** aToken address (receipt token for deposits). */
  aTokenAddress: Address
  /** Variable debt token address. */
  variableDebtTokenAddress: Address
  /** Supplied balance in asset's decimals (raw bigint). */
  suppliedRaw: bigint
  /** Supplied balance as human-readable number. */
  supplied: number
  /** Supplied value in USD. */
  suppliedUSD: number
  /** Variable borrowed balance in asset's decimals (raw bigint). */
  borrowedRaw: bigint
  /** Borrowed balance as human-readable number. */
  borrowed: number
  /** Borrowed value in USD. */
  borrowedUSD: number
  /** Current supply APY as percentage (e.g., 3.5 = 3.5%). */
  supplyAPY: number
  /** Current variable borrow APY as percentage. */
  borrowAPY: number
  /** Loan-to-value ratio for this asset (e.g., 0.8 = 80%). */
  ltv: number
  /** Liquidation threshold for this asset (e.g., 0.85 = 85%). */
  liquidationThreshold: number
  /** Whether this reserve can be used as collateral. */
  usageAsCollateralEnabled: boolean
}

/** Aggregated Aave account summary across all reserves. */
export interface AaveAccountSummary {
  /** Total collateral in USD (sum of all supplied assets). */
  totalCollateralUSD: number
  /** Total debt in USD (sum of all borrowed assets). */
  totalDebtUSD: number
  /** Remaining borrow capacity in USD. */
  availableBorrowsUSD: number
  /** Health factor — <1.0 means liquidatable. Returned as number (1e18 precision from contract, converted). */
  healthFactor: number
  /** Weighted average liquidation threshold across all collateral. */
  currentLiquidationThreshold: number
  /** Weighted average LTV across all collateral. */
  currentLtv: number
}

/** State machine for margin operations (mirrors SwapStatus pattern). */
export type MarginStatus =
  | 'idle'
  | 'approving'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'error'

/** The four basic Aave operations. */
export type MarginAction = 'supply' | 'borrow' | 'repay' | 'withdraw'
