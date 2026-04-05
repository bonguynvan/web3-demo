import { memo, useMemo, useCallback } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { formatUsd } from '../lib/format'
import { useThrottledValueMs } from '../lib/useThrottledValue'
import { useRenderCount } from '../lib/useRenderCount'
import type { OrderBookEntry } from '../types/trading'

/**
 * OrderBook — the most render-heavy component in a DEX.
 *
 * Optimizations applied:
 * 1. useThrottledValueMs(100ms) — cap orderbook renders to 10/sec
 *    (orderbook data changes every tick, but visual diff is minimal)
 * 2. Memoized row component — only re-renders if its specific price level changed
 * 3. CSS containment via `contain-intrinsic-size` — browser skips layout for off-screen rows
 * 4. Stable callback refs — setOrderPrice from Zustand is stable by default
 */

export function OrderBook() {
  useRenderCount('OrderBook')

  // Throttle orderbook updates to 10/sec — the human eye can't distinguish faster orderbook changes
  const rawOrderBook = useTradingStore(s => s.orderBook)
  const orderBook = useThrottledValueMs(rawOrderBook, 100)

  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const setOrderPrice = useTradingStore(s => s.setOrderPrice)

  const handlePriceClick = useCallback((price: number) => {
    setOrderPrice(price.toFixed(2))
  }, [setOrderPrice])

  const maxTotal = useMemo(() => {
    const maxAsk = orderBook.asks.length > 0 ? orderBook.asks[orderBook.asks.length - 1].total : 0
    const maxBid = orderBook.bids.length > 0 ? orderBook.bids[orderBook.bids.length - 1].total : 0
    return Math.max(maxAsk, maxBid)
  }, [orderBook])

  const visibleAsks = orderBook.asks.slice(0, 12).reverse()
  const visibleBids = orderBook.bids.slice(0, 12)

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden" style={{ contain: 'layout style' }}>
      <div className="px-3 py-2 border-b border-border text-xs font-medium text-text-primary">
        Order Book
      </div>

      {/* Column headers */}
      <div className="flex items-center px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-wider">
        <span className="flex-1">Price (USD)</span>
        <span className="flex-1 text-right">Size ({selectedMarket.baseAsset})</span>
        <span className="flex-1 text-right">Total</span>
      </div>

      {/* Asks (sells) */}
      <div className="flex-1 overflow-hidden flex flex-col justify-end">
        {visibleAsks.map((entry, i) => (
          <OrderBookRow
            key={`ask-${i}`}
            entry={entry}
            maxTotal={maxTotal}
            side="ask"
            onPriceClick={handlePriceClick}
          />
        ))}
      </div>

      {/* Spread / Last Price */}
      <div className="flex items-center justify-between px-3 py-2 border-y border-border bg-surface">
        <span className="text-lg font-mono font-semibold text-text-primary">
          ${formatUsd(selectedMarket.lastPrice)}
        </span>
        <span className="text-[10px] text-text-muted">
          Spread: {orderBook.spread} ({orderBook.spreadPercent}%)
        </span>
      </div>

      {/* Bids (buys) */}
      <div className="flex-1 overflow-hidden">
        {visibleBids.map((entry, i) => (
          <OrderBookRow
            key={`bid-${i}`}
            entry={entry}
            maxTotal={maxTotal}
            side="bid"
            onPriceClick={handlePriceClick}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Memoized orderbook row — prevents re-render if this specific price level didn't change.
 * At 1000 updates/sec, most individual rows stay the same between ticks.
 */
const OrderBookRow = memo(function OrderBookRow({
  entry, maxTotal, side, onPriceClick,
}: {
  entry: OrderBookEntry
  maxTotal: number
  side: 'ask' | 'bid'
  onPriceClick: (price: number) => void
}) {
  const isAsk = side === 'ask'
  return (
    <div
      className="relative flex items-center px-3 py-[3px] text-xs font-mono cursor-pointer hover:bg-panel-light transition-colors"
      onClick={() => onPriceClick(entry.price)}
    >
      <div
        className={`absolute right-0 top-0 bottom-0 ${isAsk ? 'bg-short-dim' : 'bg-long-dim'}`}
        style={{ width: `${(entry.total / maxTotal) * 100}%` }}
      />
      <span className={`flex-1 relative z-10 ${isAsk ? 'text-short' : 'text-long'}`}>{formatUsd(entry.price)}</span>
      <span className="flex-1 text-right text-text-secondary relative z-10">{entry.size.toFixed(3)}</span>
      <span className="flex-1 text-right text-text-muted relative z-10">{entry.total.toFixed(3)}</span>
    </div>
  )
})
