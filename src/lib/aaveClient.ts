/**
 * Aave V3 read client — fetches user position data from Aave Pool contract.
 *
 * Uses direct contract reads via viem (no SDK dependency).
 * All values are converted from Aave's native precision (WAD/RAY/8-dec USD)
 * to human-readable numbers.
 */

import { type Address, type PublicClient } from 'viem'
import { AAVE_POOL, AAVE_POOL_ABI, AAVE_USD_DECIMALS, WAD } from './aaveConstants'
import type { AaveAccountSummary } from '../types/margin'

// ─── Response envelope ──────────────────────────────────────────────────────

interface AaveSuccess<T> {
  success: true
  data: T
}

interface AaveError {
  success: false
  error: string
}

type AaveResponse<T> = AaveSuccess<T> | AaveError

// ─── Client ─────────────────────────────────────────────────────────────────

export const aaveClient = {
  /**
   * Fetch aggregated account data from Aave Pool.
   * Returns total collateral, debt, available borrows, health factor, LTV.
   */
  async getUserAccountData(
    publicClient: PublicClient,
    userAddress: Address,
  ): Promise<AaveResponse<AaveAccountSummary>> {
    try {
      const result = await publicClient.readContract({
        address: AAVE_POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'getUserAccountData',
        args: [userAddress],
      })

      const [
        totalCollateralBase,
        totalDebtBase,
        availableBorrowsBase,
        currentLiquidationThreshold,
        ltv,
        healthFactor,
      ] = result as [bigint, bigint, bigint, bigint, bigint, bigint]

      // Aave returns USD values in 8 decimals
      const usdDivisor = 10 ** AAVE_USD_DECIMALS

      // Health factor is in WAD (1e18). Max uint256 means no debt.
      const hf = healthFactor >= WAD * 100n
        ? Infinity
        : Number(healthFactor) / 1e18

      return {
        success: true,
        data: {
          totalCollateralUSD: Number(totalCollateralBase) / usdDivisor,
          totalDebtUSD: Number(totalDebtBase) / usdDivisor,
          availableBorrowsUSD: Number(availableBorrowsBase) / usdDivisor,
          healthFactor: hf,
          currentLiquidationThreshold: Number(currentLiquidationThreshold) / 10000,
          currentLtv: Number(ltv) / 10000,
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch Aave data'
      return { success: false, error: msg }
    }
  },
}
