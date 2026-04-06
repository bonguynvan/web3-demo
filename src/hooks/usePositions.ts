/**
 * usePositions — read open positions from PositionManager.
 *
 * Checks all combinations of [WETH, WBTC] × [long, short] for the connected wallet.
 * Returns only non-zero positions with computed PnL.
 */

import { useAccount, useChainId, useReadContracts } from 'wagmi'
import { type Address } from 'viem'
import { getContracts, getMarkets } from '../lib/contracts'
import { internalToDollars, formatLeverage, PRICE_PRECISION } from '../lib/precision'
import { usePrices } from './usePrices'

export interface OnChainPosition {
  /** Position key for identification */
  key: string
  market: string
  baseAsset: string
  indexToken: Address
  side: 'long' | 'short'
  /** Size in USD (display) */
  size: number
  /** Size raw (30-dec) */
  sizeRaw: bigint
  /** Collateral in USD (display) */
  collateral: number
  /** Collateral raw (30-dec) */
  collateralRaw: bigint
  /** Entry price (display) */
  entryPrice: number
  /** Entry price raw (30-dec) */
  entryPriceRaw: bigint
  /** Current mark price (display) */
  markPrice: number
  /** Leverage string (e.g., "10.0x") */
  leverage: string
  /** Unrealized PnL in USD */
  pnl: number
  /** PnL as percentage of collateral */
  pnlPercent: number
  /** Estimated liquidation price */
  liquidationPrice: number
}

interface PositionSlot {
  market: string
  baseAsset: string
  indexToken: Address
  isLong: boolean
}

export function usePositions() {
  const { address } = useAccount()
  const chainId = useChainId()
  const { prices } = usePrices()

  let contracts: ReturnType<typeof getContracts> | null = null
  let slots: PositionSlot[] = []
  try {
    contracts = getContracts(chainId)
    const markets = getMarkets(contracts.addresses)
    // Check all [token × direction] combinations
    slots = markets.flatMap(m => [
      { market: m.symbol, baseAsset: m.baseAsset, indexToken: m.indexToken, isLong: true },
      { market: m.symbol, baseAsset: m.baseAsset, indexToken: m.indexToken, isLong: false },
    ])
  } catch {
    // Chain not configured
  }

  const { data, ...query } = useReadContracts({
    contracts: slots.map(slot => ({
      ...contracts!.positionManager,
      functionName: 'getPosition' as const,
      args: [address!, slot.indexToken, slot.isLong] as const,
    })),
    query: {
      enabled: !!address && !!contracts && slots.length > 0,
      refetchInterval: 5_000,
    },
  })

  const positions: OnChainPosition[] = []

  if (data) {
    for (let i = 0; i < slots.length; i++) {
      const result = data[i]
      if (result?.status !== 'success') continue

      // getPosition returns (size, collateral, averagePrice, entryFundingRate, lastUpdatedTime)
      const raw = result.result as readonly [bigint, bigint, bigint, bigint, bigint]
      const [sizeRaw, collateralRaw, avgPriceRaw] = raw

      if (sizeRaw === 0n) continue // No position

      const slot = slots[i]
      const side = slot.isLong ? 'long' : 'short' as const

      // Get current price for PnL
      const tokenPrice = prices.find(p => p.market === slot.market)
      const markPriceRaw = tokenPrice?.raw ?? avgPriceRaw

      // Calculate PnL (mirrors PositionMath.getDelta)
      const hasProfit = slot.isLong
        ? markPriceRaw > avgPriceRaw
        : avgPriceRaw > markPriceRaw
      const priceDelta = hasProfit
        ? (slot.isLong ? markPriceRaw - avgPriceRaw : avgPriceRaw - markPriceRaw)
        : (slot.isLong ? avgPriceRaw - markPriceRaw : markPriceRaw - avgPriceRaw)
      const deltaRaw = avgPriceRaw > 0n ? (sizeRaw * priceDelta) / avgPriceRaw : 0n
      const pnlRaw = hasProfit ? deltaRaw : -deltaRaw
      const pnl = internalToDollars(pnlRaw < 0n ? -pnlRaw : pnlRaw) * (pnlRaw < 0n ? -1 : 1)

      const collateral = internalToDollars(collateralRaw)
      const pnlPercent = collateral > 0 ? (pnl / collateral) * 100 : 0

      // Estimate liquidation price (simplified)
      const leverageBps = collateralRaw > 0n ? (sizeRaw * 10_000n) / collateralRaw : 0n
      const leverageNum = Number(leverageBps) / 10_000
      const entryPrice = internalToDollars(avgPriceRaw)
      const marginPerUnit = leverageNum > 0 ? entryPrice / leverageNum : 0
      const liqPrice = slot.isLong
        ? entryPrice - marginPerUnit * 0.95 // 5% buffer for fees
        : entryPrice + marginPerUnit * 0.95

      positions.push({
        key: `${slot.indexToken}-${side}`,
        market: slot.market,
        baseAsset: slot.baseAsset,
        indexToken: slot.indexToken,
        side,
        size: internalToDollars(sizeRaw),
        sizeRaw,
        collateral,
        collateralRaw,
        entryPrice,
        entryPriceRaw: avgPriceRaw,
        markPrice: tokenPrice?.price ?? entryPrice,
        leverage: formatLeverage(sizeRaw, collateralRaw),
        pnl,
        pnlPercent,
        liquidationPrice: Math.max(0, liqPrice),
      })
    }
  }

  return {
    positions,
    ...query,
  }
}
