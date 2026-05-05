/**
 * Logo — TradingDek brand mark.
 *
 * Concept: a sparkline that descends, pivots, and breaks upward through
 * a horizontal "deck" level line, ending in a pinned target dot. The
 * horizontal line reads as the deck — a flat threshold the price action
 * has crossed. The pinned dot reads as the signal trigger.
 *
 * Uses currentColor so it inherits whatever wraps it. Two variants:
 *  - tile: filled accent square with the glyph inside (primary brand block)
 *  - glyph: bare SVG (inline / mobile usage where the bg is provided)
 */

import { cn } from '../../lib/format'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'tile' | 'glyph'
  className?: string
}

const SIZE_PX = { sm: 24, md: 32, lg: 48 } as const
const TILE_PX = { sm: 24, md: 28, lg: 40 } as const

export function Logo({ size = 'md', variant = 'tile', className }: LogoProps) {
  if (variant === 'glyph') {
    const px = SIZE_PX[size]
    return (
      <svg
        width={px}
        height={px}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={className}
      >
        <path d="M3 20 H29" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
        <path
          d="M4 22 L10 24 L16 18 L22 14 L27 6"
          stroke="currentColor"
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="27" cy="6" r="3.2" fill="currentColor" />
      </svg>
    )
  }

  const tile = TILE_PX[size]
  const inner = Math.round(tile * 0.72)

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-md bg-accent text-surface shrink-0 ring-1 ring-accent/40 shadow-[0_0_18px_-4px_var(--color-accent-dim)]',
        className,
      )}
      style={{ width: tile, height: tile }}
    >
      <svg
        width={inner}
        height={inner}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M3 20 H29" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
        <path
          d="M4 22 L10 24 L16 18 L22 14 L27 6"
          stroke="currentColor"
          strokeWidth="2.8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="27" cy="6" r="3.2" fill="currentColor" />
      </svg>
    </div>
  )
}

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Wordmark({ size = 'md', className }: WordmarkProps) {
  const text = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm'
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Logo size={size} variant="tile" />
      <span
        className={cn(
          'font-mono font-semibold tracking-[0.18em] text-text-primary uppercase',
          text,
        )}
      >
        Trading<span className="text-accent">Dek</span>
      </span>
    </div>
  )
}
