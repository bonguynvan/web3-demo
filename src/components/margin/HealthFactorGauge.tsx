/**
 * HealthFactorGauge — visual indicator for Aave health factor.
 *
 * Color coding:
 *   Green  (>2.0)   — Safe
 *   Yellow (1.5-2.0) — Caution
 *   Orange (1.2-1.5) — Danger
 *   Red    (<1.2)    — Liquidation Risk
 */

import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/format'

interface HealthFactorGaugeProps {
  healthFactor: number
  compact?: boolean
}

export function HealthFactorGauge({ healthFactor, compact }: HealthFactorGaugeProps) {
  const { t } = useTranslation('margin')

  const { color, bgColor, label } = getHealthFactorStyle(healthFactor, t)
  const displayValue = healthFactor === Infinity ? '∞' : healthFactor.toFixed(2)

  if (compact) {
    return (
      <span className={cn('font-mono font-medium', color)}>
        {displayValue}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium', bgColor, color)}>
        <div className={cn(
          'w-2 h-2 rounded-full',
          healthFactor < 1.2 && 'animate-pulse',
          healthFactor < 1.0 ? 'bg-red-500' :
          healthFactor < 1.2 ? 'bg-orange-500' :
          healthFactor < 1.5 ? 'bg-orange-400' :
          healthFactor < 2.0 ? 'bg-yellow-400' : 'bg-green-400',
        )} />
        <span className="font-mono">{displayValue}</span>
      </div>
      <span className={cn('text-[10px]', color)}>{label}</span>
    </div>
  )
}

function getHealthFactorStyle(hf: number, t: (key: string) => string) {
  if (hf < 1.0) return {
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: t('liquidation_risk'),
  }
  if (hf < 1.2) return {
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    label: t('danger'),
  }
  if (hf < 1.5) return {
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    label: t('danger'),
  }
  if (hf < 2.0) return {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    label: t('caution'),
  }
  return {
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    label: t('safe'),
  }
}
