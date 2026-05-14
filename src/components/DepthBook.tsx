/**
 * DepthBook — real venue orderbook ladder.
 *
 * Subscribes to the active adapter's orderbook stream, with a one-shot
 * REST seed for the initial render. Falls back to a "no depth" hint when
 * the active venue can't provide an orderbook (e.g. read-only adapters
 * still implementing it).
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { DepthChart, DARK_TERMINAL } from '@tradecanvas/chart'
import { usePrices } from '../hooks/usePrices'
import { useActiveVenue } from '../hooks/useActiveVenue'
import { getActiveAdapter } from '../adapters/registry'
import { useTradingStore } from '../store/tradingStore'
import { cn, formatCompact } from '../lib/format'
import { FlashPrice } from './ui/FlashPrice'
import type { OrderBook } from '../adapters/types'

const LEVELS = 15

interface DisplayLevel {
  price: number
  size: number
  total: number
  percent: number
}

export function DepthBook() {
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const setOrderPrice = useTradingStore(s => s.setOrderPrice)
  const venueId = useActiveVenue()
  const { getPrice } = usePrices()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [book, setBook] = useState<OrderBook | null>(null)
  const [unsupported, setUnsupported] = useState(false)

  // Subscribe to orderbook for the selected market on the active venue
  useEffect(() => {
    setBook(null)
    setUnsupported(false)

    const adapter = getActiveAdapter()
    let cancelled = false
    let unsub: (() => void) | null = null

    void (async () => {
      try {
        // One-shot seed
        const seed = await adapter.getOrderBook(selectedMarket.symbol)
        if (!cancelled) setBook(seed)
      } catch {
        // Venue doesn't support orderbook (or REST failed); we'll still
        // try the WS sub since some adapters only ship one of the two.
      }

      if (cancelled) return

      unsub = adapter.subscribeOrderBook(selectedMarket.symbol, (next) => {
        if (cancelled) return
        setBook(next)
      })

      // If after 2s we still have nothing, mark venue as not supporting depth
      setTimeout(() => {
        if (cancelled) return
        setBook(prev => {
          if (!prev) setUnsupported(true)
          return prev
        })
      }, 2000)
    })()

    return () => {
      cancelled = true
      if (unsub) unsub()
    }
  }, [selectedMarket.symbol, venueId])

  const currentPrice = getPrice(selectedMarket.symbol)
  const tickerMid = currentPrice?.price ?? 0

  const { asks, bids, midPrice, spread, spreadPercent } = useMemo(() => {
    return projectBook(book, tickerMid)
  }, [book, tickerMid])

  // Auto-scroll to spread on first level set
  useEffect(() => {
    if (scrollRef.current && asks.length > 0) {
      const el = scrollRef.current
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
    }
  }, [asks.length])

  const handlePriceClick = useCallback((price: number) => {
    setOrderPrice(price.toFixed(2))
  }, [setOrderPrice])

  const decimals = midPrice > 10000 ? 1 : midPrice > 100 ? 2 : midPrice > 1 ? 4 : 6

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-primary">Depth</span>
        <span className="text-[10px] text-text-muted uppercase tracking-wider">
          {getActiveAdapter().displayName}
        </span>
      </div>

      {book && asks.length > 0 && bids.length > 0 && (
        <div className="border-b border-border shrink-0">
          <DepthCurve book={book} decimals={decimals} />
        </div>
      )}

      <div className="flex items-center px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider border-b border-border shrink-0">
        <span className="flex-1">Price</span>
        <span className="flex-1 text-right">Size</span>
        <span className="flex-1 text-right">Total</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ contain: 'layout' }}>
        {unsupported ? (
          <DepthFallback midPrice={midPrice} decimals={decimals} />
        ) : asks.length === 0 && bids.length === 0 ? (
          <DepthLoading />
        ) : (
          <>
            {asks.map((level, i) => (
              <DepthRow
                key={`ask-${i}-${level.price}`}
                {...level}
                side="ask"
                decimals={decimals}
                onClick={handlePriceClick}
              />
            ))}

            <div className="flex items-center justify-center px-3 py-1.5 border-y border-border bg-surface/50">
              {midPrice > 0 ? (
                <FlashPrice value={midPrice} size="lg" showArrow format={n => n.toFixed(decimals)} />
              ) : (
                <span className="text-sm font-mono text-text-muted">---</span>
              )}
              {spread > 0 && (
                <span className="text-[10px] text-text-muted ml-2">
                  Spread: {spread.toFixed(decimals)} ({spreadPercent.toFixed(3)}%)
                </span>
              )}
            </div>

            {bids.map((level, i) => (
              <DepthRow
                key={`bid-${i}-${level.price}`}
                {...level}
                side="bid"
                decimals={decimals}
                onClick={handlePriceClick}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function projectBook(book: OrderBook | null, fallbackMid: number) {
  if (!book || (book.bids.length === 0 && book.asks.length === 0)) {
    return {
      asks: [] as DisplayLevel[], bids: [] as DisplayLevel[],
      midPrice: fallbackMid, spread: 0, spreadPercent: 0,
    }
  }

  const askSlice = book.asks.slice(0, LEVELS)
  const bidSlice = book.bids.slice(0, LEVELS)

  let askTotal = 0
  let bidTotal = 0
  const askDisplay: DisplayLevel[] = askSlice.map(l => {
    askTotal += l.size
    return { price: l.price, size: l.size, total: askTotal, percent: 0 }
  })
  const bidDisplay: DisplayLevel[] = bidSlice.map(l => {
    bidTotal += l.size
    return { price: l.price, size: l.size, total: bidTotal, percent: 0 }
  })

  const maxTotal = Math.max(askTotal, bidTotal)
  for (const l of askDisplay) l.percent = maxTotal > 0 ? l.total / maxTotal : 0
  for (const l of bidDisplay) l.percent = maxTotal > 0 ? l.total / maxTotal : 0

  const bestAsk = askSlice[0]?.price ?? 0
  const bestBid = bidSlice[0]?.price ?? 0
  const midPrice = bestAsk > 0 && bestBid > 0 ? (bestAsk + bestBid) / 2 : fallbackMid
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0
  const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0

  return {
    asks: askDisplay.reverse(), // highest ask at top
    bids: bidDisplay,
    midPrice, spread, spreadPercent,
  }
}

function DepthLoading() {
  return (
    <div className="flex items-center justify-center h-full text-xs text-text-muted">
      Loading order book…
    </div>
  )
}

function DepthFallback({ midPrice, decimals }: { midPrice: number; decimals: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-2">
      <span className="text-xs text-text-secondary">No depth from this venue</span>
      <span className="text-[10px] text-text-muted leading-relaxed">
        Switch to a venue that exposes an orderbook (e.g. Hyperliquid)
        to see real depth here.
      </span>
      {midPrice > 0 && (
        <span className="font-mono text-text-primary mt-2">
          Mid: {midPrice.toFixed(decimals)}
        </span>
      )}
    </div>
  )
}

function DepthRow({
  price, size, total, percent, side, decimals, onClick,
}: {
  price: number; size: number; total: number; percent: number;
  side: 'ask' | 'bid'; decimals: number;
  onClick: (price: number) => void;
}) {
  const textColor = side === 'ask' ? 'text-short' : 'text-long'
  const barColor = side === 'ask' ? 'bg-short/15' : 'bg-long/15'

  return (
    <div
      onClick={() => onClick(price)}
      className="relative flex items-center px-3 py-[2px] text-xs font-mono cursor-pointer hover:bg-panel-light transition-colors"
    >
      <div
        className={cn('absolute inset-y-0 right-0', barColor)}
        style={{ width: `${percent * 100}%` }}
      />
      <span className={cn('flex-1 relative z-10', textColor)}>
        {price.toFixed(decimals)}
      </span>
      <span className="flex-1 text-right text-text-secondary relative z-10">
        {formatCompact(size)}
      </span>
      <span className="flex-1 text-right text-text-muted relative z-10">
        {formatCompact(total)}
      </span>
    </div>
  )
}

/**
 * DepthCurve — cumulative bid/ask area chart over the ladder.
 *
 * Powered by @tradecanvas/chart 0.6 DepthChart. Shows the SAME data as
 * the ladder below (same `book` snapshot) in the cumulative-volume
 * representation traders use to spot walls of liquidity. Mid-price
 * line + spread label come built-in; crosshair lets users hover any
 * level to read price/volume.
 */
function DepthCurve({ book, decimals }: { book: OrderBook; decimals: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<DepthChart | null>(null)
  const HEIGHT = 120

  const data = useMemo(() => ({
    bids: book.bids.map(l => ({ price: l.price, volume: l.size })),
    asks: book.asks.map(l => ({ price: l.price, volume: l.size })),
  }), [book])

  useEffect(() => {
    if (!containerRef.current) return
    const chart = new DepthChart(containerRef.current, {
      data,
      theme: DARK_TERMINAL,
      midPriceLine: true,
      spreadLabel: true,
      crosshair: true,
      priceFormat: (p) => p.toFixed(decimals),
      volumeFormat: (v) => formatCompact(v),
    })
    chartRef.current = chart
    return () => { chart.destroy(); chartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.setOptions({ data })
  }, [data])

  return <div ref={containerRef} style={{ width: '100%', height: HEIGHT }} />
}
