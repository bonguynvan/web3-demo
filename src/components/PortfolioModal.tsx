/**
 * PortfolioModal — unified portfolio dashboard showing all positions,
 * equity breakdown, and allocation chart.
 */

import { useTranslation } from 'react-i18next'
import { Wallet, TrendingUp } from 'lucide-react'
import { usePortfolioData, type PortfolioPosition } from '../hooks/usePortfolioData'
import { AllocationChart } from './portfolio/AllocationChart'
import { Modal } from './ui/Modal'
import { cn, formatUsd } from '../lib/format'

interface PortfolioModalProps {
  open: boolean
  onClose: () => void
}

export function PortfolioModal({ open, onClose }: PortfolioModalProps) {
  const {
    totalEquity,
    availableBalance,
    totalCollateral,
    totalUnrealizedPnl,
    positionCount,
    allPositions,
    allocation,
  } = usePortfolioData()

  return (
    <Modal open={open} onClose={onClose} title="Portfolio Overview" maxWidth="max-w-2xl">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <StatCard label="Total Equity" value={`$${formatUsd(totalEquity)}`} />
        <StatCard label="Available" value={`$${formatUsd(availableBalance)}`} />
        <StatCard
          label="Unrealized PnL"
          value={`${totalUnrealizedPnl >= 0 ? '+' : ''}$${formatUsd(Math.abs(totalUnrealizedPnl))}`}
          valueClass={totalUnrealizedPnl >= 0 ? 'text-long' : 'text-short'}
        />
        <StatCard label="Positions" value={String(positionCount)} />
      </div>

      {/* Allocation chart */}
      <div className="bg-surface/50 rounded-lg p-4 mb-4">
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-3">Asset Allocation</div>
        <AllocationChart segments={allocation} total={totalEquity} />
      </div>

      {/* All positions table */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">All Positions</div>
        {allPositions.length === 0 ? (
          <div className="flex flex-col items-center py-6 gap-2 text-text-muted">
            <Wallet className="w-5 h-5" />
            <span className="text-xs">No active positions</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
                  <th className="text-left px-2 py-2 font-medium">Product</th>
                  <th className="text-left px-2 py-2 font-medium">Market</th>
                  <th className="text-left px-2 py-2 font-medium">Side</th>
                  <th className="text-right px-2 py-2 font-medium">Size</th>
                  <th className="text-right px-2 py-2 font-medium">PnL</th>
                  <th className="text-right px-2 py-2 font-medium">Collateral</th>
                </tr>
              </thead>
              <tbody>
                {allPositions.map((pos, i) => (
                  <PositionRow key={`${pos.product}-${pos.market}-${i}`} position={pos} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}

function StatCard({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="bg-surface/50 rounded-lg p-3">
      <div className="text-[9px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className={cn('text-sm font-mono font-semibold text-text-primary mt-0.5', valueClass)}>
        {value}
      </div>
    </div>
  )
}

const PRODUCT_COLORS: Record<string, string> = {
  perp: 'bg-long-dim text-long',
  futures: 'bg-amber-400/10 text-amber-400',
  margin: 'bg-purple-500/10 text-purple-400',
}

function PositionRow({ position }: { position: PortfolioPosition }) {
  return (
    <tr className="border-b border-border/50 hover:bg-panel-light transition-colors">
      <td className="px-2 py-2">
        <span className={cn(
          'px-1.5 py-0.5 rounded text-[9px] font-medium uppercase',
          PRODUCT_COLORS[position.product] ?? 'bg-surface text-text-muted',
        )}>
          {position.product}
          {position.extra && ` ${position.extra}`}
        </span>
      </td>
      <td className="px-2 py-2 font-medium text-text-primary">{position.market}</td>
      <td className="px-2 py-2 text-text-secondary">{position.side}</td>
      <td className="px-2 py-2 text-right font-mono text-text-secondary">${formatUsd(position.size)}</td>
      <td className="px-2 py-2 text-right">
        {position.pnl !== 0 ? (
          <span className={cn('font-mono font-medium', position.pnl >= 0 ? 'text-long' : 'text-short')}>
            {position.pnl >= 0 ? '+' : ''}${formatUsd(Math.abs(position.pnl))}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-2 py-2 text-right font-mono text-text-secondary">${formatUsd(position.collateral)}</td>
    </tr>
  )
}
