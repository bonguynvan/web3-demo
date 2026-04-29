/**
 * usePortfolioData — aggregates position data across all products.
 *
 * Combines perp positions, futures positions, margin (Aave) positions,
 * and USDC balance into a unified portfolio view.
 */

import { useMemo } from 'react'
import { usePositions } from './usePositions'
import { useFuturesPositions } from './useFuturesPositions'
import { useUsdcBalance } from './useTokenBalance'
import { useIsDemo } from '../store/modeStore'
import { DEMO_ACCOUNT } from '../lib/demoData'

export interface PortfolioPosition {
  product: 'perp' | 'futures'
  market: string
  side: string
  size: number
  entryPrice: number
  markPrice: number
  pnl: number
  collateral: number
  extra?: string
}

export interface AllocationSegment {
  label: string
  value: number
  color: string
}

export function usePortfolioData() {
  const { positions: perpPositions } = usePositions()
  const { positions: futuresActive } = useFuturesPositions()
  const { dollars: usdcBalance } = useUsdcBalance()
  const isDemo = useIsDemo()

  const balance = isDemo ? DEMO_ACCOUNT.balance : usdcBalance

  return useMemo(() => {
    const allPositions: PortfolioPosition[] = []

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

    const totalPerpCollateral = perpPositions.reduce((s, p) => s + p.collateral, 0)
    const totalFuturesCollateral = futuresActive.reduce((s, f) => s + f.collateral, 0)
    const totalUnrealizedPnl =
      perpPositions.reduce((s, p) => s + p.pnl, 0) +
      futuresActive.reduce((s, f) => s + f.pnl, 0)

    const totalCollateral = totalPerpCollateral + totalFuturesCollateral
    const totalEquity = balance + totalCollateral + totalUnrealizedPnl

    const allocation: AllocationSegment[] = []
    if (balance > 0) allocation.push({ label: 'Available', value: balance, color: '#6366f1' })
    if (totalPerpCollateral > 0) allocation.push({ label: 'Perps', value: totalPerpCollateral, color: '#22c55e' })
    if (totalFuturesCollateral > 0) allocation.push({ label: 'Futures', value: totalFuturesCollateral, color: '#f59e0b' })

    return {
      totalEquity,
      availableBalance: balance,
      totalCollateral,
      totalUnrealizedPnl,
      positionCount: allPositions.length,
      allPositions,
      allocation,
    }
  }, [perpPositions, futuresActive, balance, isDemo])
}
