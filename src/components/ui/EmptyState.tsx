/**
 * EmptyState — shared placeholder for "no data" surfaces.
 *
 * Use anywhere a list/table has zero rows. Encourages a contextual
 * CTA (`action`) instead of a dead-end "No data." string. Keep the
 * title under ~50 chars and the description to one short sentence.
 *
 * Variants:
 *   - density="compact" (default): py-6, smaller text — fits inside a
 *     section under existing headers
 *   - density="spacious": py-10, larger text — for full-page empties
 *     like "No bots configured yet"
 */

import type { ReactNode } from 'react'
import { cn } from '../../lib/format'

interface EmptyStateProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  /** Optional icon (Lucide component or anything else). */
  icon?: ReactNode
  density?: 'compact' | 'spacious'
  className?: string
}

export function EmptyState({
  title, description, action, icon,
  density = 'compact',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-panel/30 text-center',
        density === 'spacious' ? 'px-4 py-10' : 'px-4 py-6',
        className,
      )}
    >
      {icon && (
        <div className="flex justify-center mb-2 text-text-muted">
          {icon}
        </div>
      )}
      <div className={cn(
        'font-medium text-text-secondary',
        density === 'spacious' ? 'text-sm' : 'text-xs',
      )}>
        {title}
      </div>
      {description && (
        <div className={cn(
          'mt-1 text-text-muted leading-relaxed',
          density === 'spacious' ? 'text-xs' : 'text-[11px]',
        )}>
          {description}
        </div>
      )}
      {action && (
        <div className="mt-3">{action}</div>
      )}
    </div>
  )
}
