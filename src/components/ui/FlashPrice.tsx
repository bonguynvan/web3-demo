/**
 * FlashPrice — displays a price that flashes green on uptick, red on downtick.
 *
 * The flash is a brief background highlight that fades out over 300ms.
 * This is the visual heartbeat of every trading terminal.
 */

import { useRef, useEffect, useState, memo } from 'react'
import { cn } from '../../lib/format'

interface FlashPriceProps {
  value: number
  format?: (n: number) => string
  className?: string
  /** Show +/- arrow indicator */
  showArrow?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
}

export const FlashPrice = memo(function FlashPrice({
  value,
  format = defaultFormat,
  className,
  showArrow = false,
  size = 'md',
}: FlashPriceProps) {
  const prevRef = useRef(value)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (value === prevRef.current || value === 0) return

    const direction = value > prevRef.current ? 'up' : 'down'
    prevRef.current = value

    setFlash(direction)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setFlash(null), 400)

    return () => clearTimeout(timeoutRef.current)
  }, [value])

  const sizeClass = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-[11px]' : 'text-xs'

  return (
    <span
      className={cn(
        'font-mono transition-colors duration-300 rounded px-0.5 -mx-0.5',
        sizeClass,
        flash === 'up' && 'text-long bg-long/15',
        flash === 'down' && 'text-short bg-short/15',
        !flash && 'text-text-primary',
        className,
      )}
    >
      {showArrow && (
        <span className="inline-block w-[1em] text-center">
          {flash === 'up' ? '▲' : flash === 'down' ? '▼' : '\u2007'}
        </span>
      )}
      {format(value)}
    </span>
  )
})

function defaultFormat(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
