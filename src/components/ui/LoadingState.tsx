/**
 * LoadingState — small inline "spinner + label" for in-progress loads.
 *
 * For full-section shimmers prefer Skeleton. This is for short
 * fetches where a single line of feedback is enough ("Loading
 * metrics…", "Fetching account state…").
 */

import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/format'

interface LoadingStateProps {
  label?: string
  className?: string
}

export function LoadingState({ label = 'Loading…', className }: LoadingStateProps) {
  return (
    <div
      className={cn('flex items-center gap-2 text-text-muted text-sm', className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  )
}
