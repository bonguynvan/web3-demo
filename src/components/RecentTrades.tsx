import { memo, useRef, useEffect, useState } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { cn, formatUsd, formatTime } from '../lib/format'
import { useThrottledValue } from '../lib/useThrottledValue'
import type { Trade } from '../types/trading'

/**
 * RecentTrades — live trade tape.
 *
 * New trades flash in with a brief highlight animation.
 * Large trades (whales) are highlighted with a stronger accent.
 */
export function RecentTrades() {
  const rawTrades = useTradingStore(s => s.recentTrades)
  const recentTrades = useThrottledValue(rawTrades)
  const selectedMarket = useTradingStore(s => s.selectedMarket)

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
        {recentTrades.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs">
            Waiting for trades...
          </div>
        ) : (
          recentTrades.slice(0, 40).map((trade, i) => (
            <TradeRow key={trade.id} trade={trade} isNew={i === 0} />
          ))
        )}
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
