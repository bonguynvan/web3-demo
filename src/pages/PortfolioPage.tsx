/**
 * PortfolioPage — full-page portfolio dashboard.
 *
 * Shows equity summary, allocation chart, and all positions
 * across perp/futures/margin in one unified view.
 */

import { useAccount } from 'wagmi'
import { Wallet } from 'lucide-react'
import { usePortfolioData } from '../hooks/usePortfolioData'
import { AllocationChart } from '../components/portfolio/AllocationChart'
import { cn, formatUsd } from '../lib/format'
import type { PortfolioPosition } from '../hooks/usePortfolioData'

const PRODUCT_COLORS: Record<string, string> = {
  perp: 'bg-long-dim text-long',
  futures: 'bg-amber-400/10 text-amber-400',
  margin: 'bg-purple-500/10 text-purple-400',
}

export function PortfolioPage() {
  const { isConnected } = useAccount()
  const {
    totalEquity,
    availableBalance,
    totalCollateral,
    totalUnrealizedPnl,
    positionCount,
    allPositions,
    allocation,
  } = usePortfolioData()

  if (!isConnected) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-text-muted">
          <Wallet className="w-8 h-8" />
          <span className="text-sm">Connect wallet to view portfolio</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Equity" value={`$${formatUsd(totalEquity)}`} large />
          <StatCard label="Available" value={`$${formatUsd(availableBalance)}`} />
          <StatCard
            label="Unrealized PnL"
            value={`${totalUnrealizedPnl >= 0 ? '+' : ''}$${formatUsd(Math.abs(totalUnrealizedPnl))}`}
            valueClass={totalUnrealizedPnl >= 0 ? 'text-long' : 'text-short'}
          />
          <StatCard label="Total Collateral" value={`$${formatUsd(totalCollateral)}`} />
        </div>

        {/* Allocation */}
        <div className="bg-panel rounded-xl border border-border p-5">
          <h3 className="text-xs text-text-muted uppercase tracking-wider font-medium mb-4">Asset Allocation</h3>
          <AllocationChart segments={allocation} total={totalEquity} />
        </div>

        {/* All positions */}
        <div className="bg-panel rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h3 className="text-xs text-text-muted uppercase tracking-wider font-medium">
              All Positions ({positionCount})
            </h3>
          </div>

          {allPositions.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2 text-text-muted">
              <span className="text-xs">No active positions across any product</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
                    <th className="text-left px-4 py-2.5 font-medium">Product</th>
                    <th className="text-left px-4 py-2.5 font-medium">Market</th>
                    <th className="text-left px-4 py-2.5 font-medium">Side</th>
                    <th className="text-right px-4 py-2.5 font-medium">Size</th>
                    <th className="text-right px-4 py-2.5 font-medium">Entry</th>
                    <th className="text-right px-4 py-2.5 font-medium">Mark</th>
                    <th className="text-right px-4 py-2.5 font-medium">PnL</th>
                    <th className="text-right px-4 py-2.5 font-medium">Collateral</th>
                  </tr>
                </thead>
                <tbody>
                  {allPositions.map((pos, i) => (
                    <tr key={`${pos.product}-${i}`} className="border-b border-border/50 hover:bg-panel-light transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'px-2 py-0.5 rounded text-[9px] font-medium uppercase',
                          PRODUCT_COLORS[pos.product] ?? 'bg-surface text-text-muted',
                        )}>
                          {pos.product}{pos.extra ? ` ${pos.extra}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-text-primary">{pos.market}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{pos.side}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">${formatUsd(pos.size)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                        {pos.entryPrice > 0 ? `$${formatUsd(pos.entryPrice)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                        {pos.markPrice > 0 ? `$${formatUsd(pos.markPrice)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {pos.pnl !== 0 ? (
                          <span className={cn('font-mono font-medium', pos.pnl >= 0 ? 'text-long' : 'text-short')}>
                            {pos.pnl >= 0 ? '+' : ''}${formatUsd(Math.abs(pos.pnl))}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">${formatUsd(pos.collateral)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, valueClass, large }: {
  label: string; value: string; valueClass?: string; large?: boolean
}) {
  return (
    <div className="bg-panel rounded-xl border border-border p-4">
      <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className={cn(
        'font-mono font-semibold text-text-primary mt-1',
        large ? 'text-lg' : 'text-sm',
        valueClass,
      )}>
        {value}
      </div>
    </div>
  )
}
