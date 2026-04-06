import { memo } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { cn, formatUsd, formatTime } from '../lib/format'
import { useThrottledValue } from '../lib/useThrottledValue'
import type { Trade } from '../types/trading'

/**
 * RecentTrades — trade tape.
 *
 * Optimizations:
 * 1. rAF-throttled value — at most 60 renders/sec
 * 2. Memoized rows — only new trades at the top trigger row creation
 * 3. Bounded to 30 visible — prevents DOM bloat from unbounded trade list
 */
export function RecentTrades() {
  const rawTrades = useTradingStore(s => s.recentTrades)
  const recentTrades = useThrottledValue(rawTrades)
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden" style={{ contain: 'layout style' }}>
      <div className="px-3 py-2 border-b border-border text-xs font-medium text-text-primary">
        Recent Trades
      </div>

      <div className="flex items-center px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-wider">
        <span className="flex-1">Price (USD)</span>
        <span className="flex-1 text-right">Size ({selectedMarket.baseAsset})</span>
        <span className="flex-1 text-right">Time</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {recentTrades.slice(0, 30).map(trade => (
          <TradeRow key={trade.id} trade={trade} />
        ))}
      </div>
    </div>
  )
}

const TradeRow = memo(function TradeRow({ trade }: { trade: Trade }) {
  return (
    <div className="flex items-center px-3 py-[3px] text-xs font-mono hover:bg-panel-light transition-colors">
      <span className={cn('flex-1', trade.side === 'long' ? 'text-long' : 'text-short')}>
        {formatUsd(trade.price)}
      </span>
      <span className="flex-1 text-right text-text-secondary">{trade.size.toFixed(3)}</span>
      <span className="flex-1 text-right text-text-muted">{formatTime(trade.time)}</span>
    </div>
  )
})
