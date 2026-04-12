/**
 * usePortfolioData — aggregates position data across all products.
 *
 * Combines perp positions, futures positions, margin (Aave) positions,
 * and USDC balance into a unified portfolio view.
 */

import { useMemo } from 'react'
import { usePositions } from './usePositions'
import { useFuturesPositions } from './useFuturesPositions'
import { useAavePositions } from './useAavePositions'
import { useUsdcBalance } from './useTokenBalance'
import { useIsDemo } from '../store/modeStore'
import { DEMO_ACCOUNT } from '../lib/demoData'

export interface PortfolioPosition {
  product: 'perp' | 'futures' | 'margin'
  market: string
  side: string
  size: number
  entryPrice: number
  markPrice: number
  pnl: number
  collateral: number
  extra?: string // tenor for futures, leverage for perp
}

export interface AllocationSegment {
  label: string
  value: number
  color: string
}

export function usePortfolioData() {
  const { positions: perpPositions } = usePositions()
  const { positions: futuresActive } = useFuturesPositions()
  const { summary: aaveSummary } = useAavePositions()
  const { dollars: usdcBalance } = useUsdcBalance()
  const isDemo = useIsDemo()

  const balance = isDemo ? DEMO_ACCOUNT.balance : usdcBalance

  return useMemo(() => {
    // Normalize all positions
    const allPositions: PortfolioPosition[] = []

    // Perp positions
    for (const p of perpPositions) {
      allPositions.push({
        product: 'perp',
        market: p.market,
        side: `${p.side} ${p.leverage}x`,
        size: p.size,
        entryPrice: p.entryPrice,
        markPrice: p.markPrice,
        pnl: p.pnl,
        collateral: p.collateral,
      })
    }

    // Futures positions
    for (const f of futuresActive) {
      allPositions.push({
        product: 'futures',
        market: f.market,
        side: `${f.side} ${f.leverage}x`,
        size: f.size,
        entryPrice: f.entryPrice,
        markPrice: f.markPrice,
        pnl: f.pnl,
        collateral: f.collateral,
        extra: f.tenor,
      })
    }

    // Margin (Aave) — shown as a single summary row
    if (aaveSummary && aaveSummary.totalCollateralUSD > 0) {
      allPositions.push({
        product: 'margin',
        market: 'Aave V3',
        side: aaveSummary.totalDebtUSD > 0 ? 'lending + borrowing' : 'lending',
        size: aaveSummary.totalCollateralUSD,
        entryPrice: 0,
        markPrice: 0,
        pnl: 0,
        collateral: aaveSummary.totalCollateralUSD - aaveSummary.totalDebtUSD,
      })
    }

    // Totals
    const totalPerpCollateral = perpPositions.reduce((s, p) => s + p.collateral, 0)
    const totalFuturesCollateral = futuresActive.reduce((s, f) => s + f.collateral, 0)
    const totalMarginNet = aaveSummary
      ? aaveSummary.totalCollateralUSD - aaveSummary.totalDebtUSD
      : 0
    const totalUnrealizedPnl =
      perpPositions.reduce((s, p) => s + p.pnl, 0) +
      futuresActive.reduce((s, f) => s + f.pnl, 0)

    const totalCollateral = totalPerpCollateral + totalFuturesCollateral + totalMarginNet
    const totalEquity = balance + totalCollateral + totalUnrealizedPnl

    // Allocation
    const allocation: AllocationSegment[] = []
    if (balance > 0) allocation.push({ label: 'Available', value: balance, color: '#6366f1' })
    if (totalPerpCollateral > 0) allocation.push({ label: 'Perps', value: totalPerpCollateral, color: '#22c55e' })
    if (totalFuturesCollateral > 0) allocation.push({ label: 'Futures', value: totalFuturesCollateral, color: '#f59e0b' })
    if (totalMarginNet > 0) allocation.push({ label: 'Margin', value: totalMarginNet, color: '#a855f7' })

    return {
      totalEquity,
      availableBalance: balance,
      totalCollateral,
      totalUnrealizedPnl,
      positionCount: allPositions.length,
      allPositions,
      allocation,
    }
  }, [perpPositions, futuresActive, aaveSummary, balance, isDemo])
}
