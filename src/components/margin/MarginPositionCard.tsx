/**
 * MarginPositionCard — displays current Aave V3 position summary.
 *
 * Shows total collateral, debt, available borrows, health factor, and net APY.
 * Empty state when no supplies exist.
 */

import { useTranslation } from 'react-i18next'
import { Inbox } from 'lucide-react'
import { useAavePositions } from '../../hooks/useAavePositions'
import { HealthFactorGauge } from './HealthFactorGauge'
import { cn, formatUsd, formatCompact } from '../../lib/format'
import { Skeleton } from '../ui/Skeleton'

export function MarginPositionCard() {
  const { t } = useTranslation('margin')
  const { summary, isLoading } = useAavePositions()

  if (isLoading) {
    return (
      <div className="bg-surface/50 rounded-lg p-3 space-y-2">
        <Skeleton className="h-4" width={120} />
        <Skeleton className="h-3" width={200} />
        <Skeleton className="h-3" width={160} />
      </div>
    )
  }

  if (!summary || summary.totalCollateralUSD === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-2">
        <div className="w-10 h-10 rounded-full bg-surface/70 flex items-center justify-center text-text-muted">
          <Inbox className="w-4 h-4" />
        </div>
        <div className="text-[10px] text-text-muted text-center max-w-[200px]">
          {t('deposit_to_start')}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface/50 rounded-lg p-3 space-y-2.5">
      {/* Health Factor */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('health_factor')}</span>
        <HealthFactorGauge healthFactor={summary.healthFactor} />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <StatItem
          label={t('total_collateral')}
          value={`$${formatCompact(summary.totalCollateralUSD)}`}
        />
        <StatItem
          label={t('total_debt')}
          value={`$${formatCompact(summary.totalDebtUSD)}`}
          valueClass={summary.totalDebtUSD > 0 ? 'text-short' : undefined}
        />
        <StatItem
          label={t('available_to_borrow')}
          value={`$${formatCompact(summary.availableBorrowsUSD)}`}
          valueClass="text-long"
        />
        <StatItem
          label={t('ltv')}
          value={`${(summary.currentLtv * 100).toFixed(1)}%`}
        />
      </div>
    </div>
  )
}

function StatItem({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div>
      <div className="text-[9px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className={cn('font-mono text-text-primary', valueClass)}>{value}</div>
    </div>
  )
}
