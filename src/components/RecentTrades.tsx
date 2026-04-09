import { memo, useRef, useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { cn, formatUsd, formatTime } from '../lib/format'
import { useThrottledValue } from '../lib/useThrottledValue'
import { Skeleton } from './ui/Skeleton'
import type { Trade } from '../types/trading'

/** Grace period before "no trades yet" flips from skeleton shimmer to
 *  the designed empty state. Keeps the UI honest about loading vs. quiet. */
const EMPTY_GRACE_MS = 6_000

/**
 * RecentTrades — live trade tape.
 *
 * New trades flash in with a brief highlight animation.
 * Large trades (whales) are highlighted with a stronger accent.
 *
 * Loading UX:
 *   1. On mount with zero trades → skeleton shimmer rows (assume loading)
 *   2. After EMPTY_GRACE_MS still empty → designed "no trades yet" state
 *   3. First trade arrives → immediately switches to the tape
 */
export function RecentTrades() {
  const rawTrades = useTradingStore(s => s.recentTrades)
  const recentTrades = useThrottledValue(rawTrades)

  // Track whether the grace period has elapsed with still no data.
  const [graceElapsed, setGraceElapsed] = useState(false)
  useEffect(() => {
    if (recentTrades.length > 0) return
    const t = setTimeout(() => setGraceElapsed(true), EMPTY_GRACE_MS)
    return () => clearTimeout(t)
  }, [recentTrades.length])

  const isEmpty = recentTrades.length === 0

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden" style={{ contain: 'layout style' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-text-primary">Trades</span>
        <span className="text-[10px] text-text-muted font-mono">
          {recentTrades.length > 0 ? `${recentTrades.length} trades` : ''}
        </span>
      </div>

      <div className="flex items-center px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider border-b border-border/50">
        <span className="flex-1">Price</span>
        <span className="flex-1 text-right">Size</span>
        <span className="w-16 text-right">Time</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEmpty && !graceElapsed && <TradeRowSkeleton />}
        {isEmpty && graceElapsed && <TradesEmptyState />}
        {!isEmpty &&
          recentTrades.slice(0, 40).map((trade, i) => (
            <TradeRow key={trade.id} trade={trade} isNew={i === 0} />
          ))}
      </div>
    </div>
  )
}

function TradeRowSkeleton() {
  return (
    <div className="space-y-[5px] px-3 py-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-2.5 flex-1" subtle />
          <Skeleton className="h-2.5 flex-1" subtle />
          <Skeleton className="h-2.5 w-12" subtle />
        </div>
      ))}
    </div>
  )
}

function TradesEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2">
      <div className="w-10 h-10 rounded-full bg-surface/70 flex items-center justify-center">
        <Activity className="w-5 h-5 text-text-muted" />
      </div>
      <div className="text-xs text-text-secondary font-medium">No trades yet</div>
      <div className="text-[10px] text-text-muted leading-relaxed max-w-[220px]">
        The tape will populate as fills arrive.
      </div>
    </div>
  )
}

const TradeRow = memo(function TradeRow({ trade, isNew }: { trade: Trade; isNew?: boolean }) {
  const [flash, setFlash] = useState(isNew)
  const mountRef = useRef(true)

  useEffect(() => {
    if (!mountRef.current) return
    mountRef.current = false
    if (isNew) {
      const t = setTimeout(() => setFlash(false), 500)
      return () => clearTimeout(t)
    }
  }, [isNew])

  // Whale detection — trades > 10 units are highlighted
  const isWhale = trade.size >= 10

  return (
    <div
      className={cn(
        'flex items-center px-3 py-[2px] text-[11px] font-mono transition-all duration-300',
        flash && trade.side === 'long' && 'bg-long/10',
        flash && trade.side === 'short' && 'bg-short/10',
        !flash && 'hover:bg-panel-light',
        isWhale && 'font-medium',
      )}
    >
      <span className={cn('flex-1', trade.side === 'long' ? 'text-long' : 'text-short')}>
        {formatUsd(trade.price)}
      </span>
      <span className={cn(
        'flex-1 text-right',
        isWhale ? 'text-text-primary' : 'text-text-secondary',
      )}>
        {formatSize(trade.size)}
      </span>
      <span className="w-16 text-right text-text-muted text-[10px]">
        {formatTime(trade.time)}
      </span>
    </div>
  )
})

function formatSize(size: number): string {
  if (size >= 100) return size.toFixed(1)
  if (size >= 10) return size.toFixed(2)
  if (size >= 1) return size.toFixed(3)
  return size.toFixed(4)
}
