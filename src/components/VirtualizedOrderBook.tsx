/**
 * VirtualizedOrderBook — renders 1000+ price levels smoothly via react-window v2.
 *
 * WHY react-window INSTEAD OF .map()?
 * =====================================
 * Array.map() over 1000 items creates 1000 DOM nodes.
 * react-window only renders what's visible (~20 rows) and recycles elements.
 * On mobile: from 200ms+ per render → <5ms per render.
 *
 * react-window v2 API:
 *   <List rowComponent={MyRow} rowCount={N} rowHeight={H} rowProps={data} />
 *   - rowComponent receives: { index, style, ...rowProps }
 *   - style MUST be applied (contains position/transform for windowing)
 */

import { useCallback, useMemo, useRef, useState, useEffect, type CSSProperties } from 'react'
import { List, type RowComponentProps, type ListImperativeAPI } from 'react-window'
import { useTradingStore } from '../store/tradingStore'
import { formatUsd, cn } from '../lib/format'
import { useThrottledValueMs } from '../lib/useThrottledValue'
import { useRenderCount } from '../lib/useRenderCount'
import type { OrderBookEntry } from '../types/trading'

const ROW_HEIGHT = 22
const OVERSCAN = 5

export function VirtualizedOrderBook() {
  useRenderCount('VOrderBook')

  const rawOrderBook = useTradingStore(s => s.orderBook)
  const orderBook = useThrottledValueMs(rawOrderBook, 100)
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const setOrderPrice = useTradingStore(s => s.setOrderPrice)

  const asksContainerRef = useRef<HTMLDivElement>(null)
  const bidsContainerRef = useRef<HTMLDivElement>(null)
  const asksListRef = useRef<ListImperativeAPI>(null)

  const handlePriceClick = useCallback((price: number) => {
    setOrderPrice(price.toFixed(2))
  }, [setOrderPrice])

  const reversedAsks = useMemo(() => [...orderBook.asks].reverse(), [orderBook.asks])

  const maxTotal = useMemo(() => {
    const maxAsk = orderBook.asks.length > 0 ? orderBook.asks[orderBook.asks.length - 1].total : 0
    const maxBid = orderBook.bids.length > 0 ? orderBook.bids[orderBook.bids.length - 1].total : 0
    return Math.max(maxAsk, maxBid)
  }, [orderBook])

  useEffect(() => {
    if (asksListRef.current && reversedAsks.length > 0) {
      asksListRef.current.scrollToRow({ index: reversedAsks.length - 1, align: 'end' })
    }
  }, [reversedAsks.length])

  const asksRowProps: OrderBookRowProps = useMemo(() => ({
    entries: reversedAsks,
    maxTotal,
    side: 'ask' as const,
    onPriceClick: handlePriceClick,
  }), [reversedAsks, maxTotal, handlePriceClick])

  const bidsRowProps: OrderBookRowProps = useMemo(() => ({
    entries: orderBook.bids,
    maxTotal,
    side: 'bid' as const,
    onPriceClick: handlePriceClick,
  }), [orderBook.bids, maxTotal, handlePriceClick])

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden" style={{ contain: 'layout style' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-text-primary">Order Book</span>
        <span className="text-[10px] text-accent font-mono">
          {orderBook.asks.length + orderBook.bids.length} levels
        </span>
      </div>

      <div className="flex items-center px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider border-b border-border/50">
        <span className="flex-1">Price (USD)</span>
        <span className="flex-1 text-right">Size ({selectedMarket.baseAsset})</span>
        <span className="flex-1 text-right">Total</span>
      </div>

      <div ref={asksContainerRef} className="flex-1 min-h-0">
        <AutoSizedVirtualList
          containerRef={asksContainerRef}
          listRef={asksListRef}
          rowCount={reversedAsks.length}
          rowProps={asksRowProps}
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-y border-border bg-surface shrink-0">
        <span className="text-lg font-mono font-semibold text-text-primary">
          ${formatUsd(selectedMarket.lastPrice)}
        </span>
        <span className="text-[10px] text-text-muted">
          Spread: {orderBook.spread} ({orderBook.spreadPercent}%)
        </span>
      </div>

      <div ref={bidsContainerRef} className="flex-1 min-h-0">
        <AutoSizedVirtualList
          containerRef={bidsContainerRef}
          rowCount={orderBook.bids.length}
          rowProps={bidsRowProps}
        />
      </div>
    </div>
  )
}

/** Props passed to each row via rowProps */
interface OrderBookRowProps {
  entries: OrderBookEntry[]
  maxTotal: number
  side: 'ask' | 'bid'
  onPriceClick: (price: number) => void
}

/** Row component for react-window v2 */
function OrderBookRow({
  index,
  style,
  entries,
  maxTotal,
  side,
  onPriceClick,
}: RowComponentProps<OrderBookRowProps>) {
  const entry = entries[index]
  if (!entry) return null

  const isAsk = side === 'ask'
  const depthWidth = maxTotal > 0 ? (entry.total / maxTotal) * 100 : 0

  return (
    <div
      style={style}
      className="relative flex items-center px-3 text-xs font-mono cursor-pointer hover:bg-panel-light transition-colors"
      onClick={() => onPriceClick(entry.price)}
    >
      <div
        className={cn('absolute right-0 top-0 bottom-0', isAsk ? 'bg-short-dim' : 'bg-long-dim')}
        style={{ width: `${depthWidth}%` }}
      />
      <span className={cn('flex-1 relative z-10', isAsk ? 'text-short' : 'text-long')}>
        {formatUsd(entry.price)}
      </span>
      <span className="flex-1 text-right text-text-secondary relative z-10">
        {entry.size.toFixed(3)}
      </span>
      <span className="flex-1 text-right text-text-muted relative z-10">
        {entry.total.toFixed(3)}
      </span>
    </div>
  )
}

/** Wrapper that measures container and passes size to List */
function AutoSizedVirtualList({
  containerRef,
  listRef,
  rowCount,
  rowProps,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  listRef?: React.RefObject<ListImperativeAPI | null>
  rowCount: number
  rowProps: OrderBookRowProps
}) {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      setHeight(entries[0].contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  if (height === 0 || rowCount === 0) return null

  return (
    <List<OrderBookRowProps>
      listRef={listRef}
      rowComponent={OrderBookRow}
      rowCount={rowCount}
      rowHeight={ROW_HEIGHT}
      rowProps={rowProps}
      overscanCount={OVERSCAN}
      style={{ height, maxHeight: height } as CSSProperties}
    />
  )
}
