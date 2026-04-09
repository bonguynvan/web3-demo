/**
 * Skeleton — shimmer placeholder for loading states.
 *
 * Rules of thumb:
 *   - Use Skeleton during INITIAL load only. Subsequent refetches should
 *     show stale data, not flicker back to a placeholder.
 *   - Size the skeleton to match the real content so layout doesn't shift
 *     when data arrives.
 *   - Use width/height props for explicit sizing, or className for anything
 *     beyond a rectangle.
 *
 * Implementation note: Tailwind's `animate-pulse` is the effect. It cycles
 * opacity 100 → 50 → 100 over 2s, which is a softer vibe than a sliding
 * gradient and doesn't need a custom keyframe. Background uses `bg-surface`
 * so the tint respects the current theme automatically.
 */

import type { CSSProperties } from 'react'
import { cn } from '../../lib/format'

interface SkeletonProps {
  className?: string
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  /** If true, renders with a subtler tint — useful inside already-muted panels. */
  subtle?: boolean
}

export function Skeleton({ className, width, height, subtle }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded',
        subtle ? 'bg-surface/60' : 'bg-surface',
        className,
      )}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}

/**
 * SkeletonText — fixed-height skeleton sized to roughly match a line of text.
 * The `lines` prop renders a vertical stack with slight width variation so
 * the placeholder looks like real paragraph text instead of a block.
 */
export function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          width={i === lines - 1 && lines > 1 ? '75%' : '100%'}
        />
      ))}
    </div>
  )
}
