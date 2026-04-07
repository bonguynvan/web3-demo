/**
 * DepthBook — synthetic orderbook for AMM trading.
 *
 * Since there's no real orderbook (traders trade against the pool at oracle prices),
 * we generate synthetic depth levels around the current price to show:
 * - Where liquidity sits at different price points
 * - Estimated slippage for various position sizes
 * - Visual spread between long/short entry prices
 *
 * This is how GMX, Gains Network, and other AMM DEXs display "orderbook-like" data.
 */

import { useMemo, useCallback, useRef, useEffect } from 'react'
import { usePrices } from '../hooks/usePrices'
import { useVault } from '../hooks/useVault'
import { useTradingStore } from '../store/tradingStore'
import { cn, formatUsd } from '../lib/format'

const LEVELS = 15 // price levels per side
const SPREAD_BPS = 10 // 0.1% spread (matches PriceFeed config)

interface DepthLevel {
  price: number
  size: number
  total: number
  percent: number // 0-1 for bar width
}

export function DepthBook() {
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const setOrderPrice = useTradingStore(s => s.setOrderPrice)
  const { getPrice } = usePrices()
  const { stats } = useVault()
  const scrollRef = useRef<HTMLDivElement>(null)

  const currentPrice = getPrice(selectedMarket.symbol)
  const midPrice = currentPrice?.price ?? 0

  // Generate synthetic depth levels
  const { asks, bids, spread, spreadPercent } = useMemo(() => {
    if (midPrice === 0) return { asks: [], bids: [], spread: 0, spreadPercent: 0 }

    const spreadAmount = midPrice * SPREAD_BPS / 10_000
    const askBase = midPrice + spreadAmount / 2 // long entry (higher)
    const bidBase = midPrice - spreadAmount / 2 // short entry (lower)

    // Step size scales with price: ~0.01% per level for crypto
    const step = midPrice * 0.0002

    // Available liquidity determines depth
    const poolLiquidity = stats.availableLiquidity
    const maxSizePerLevel = poolLiquidity > 0 ? poolLiquidity / 20 : 50_000

    const askLevels: DepthLevel[] = []
    const bidLevels: DepthLevel[] = []
    let askTotal = 0
    let bidTotal = 0

    for (let i = 0; i < LEVELS; i++) {
      // Size increases deeper into the book (realistic depth shape)
      const depthFactor = 0.3 + (i / LEVELS) * 0.7
      const randomFactor = 0.7 + Math.random() * 0.6

      const askSize = maxSizePerLevel * depthFactor * randomFactor
      askTotal += askSize
      askLevels.push({
        price: askBase + i * step,
        size: askSize,
        total: askTotal,
        percent: 0,
      })

      const bidSize = maxSizePerLevel * depthFactor * randomFactor
      bidTotal += bidSize
      bidLevels.push({
        price: bidBase - i * step,
        size: bidSize,
        total: bidTotal,
        percent: 0,
      })
    }

    // Normalize percentages
    const maxTotal = Math.max(askTotal, bidTotal)
    for (const level of askLevels) level.percent = maxTotal > 0 ? level.total / maxTotal : 0
    for (const level of bidLevels) level.percent = maxTotal > 0 ? level.total / maxTotal : 0

    return {
      asks: askLevels.reverse(), // show highest ask at top
      bids: bidLevels,
      spread: spreadAmount,
      spreadPercent: (spreadAmount / midPrice) * 100,
    }
  }, [midPrice, stats.availableLiquidity])

  // Auto-scroll to spread on mount
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current
      // Scroll to middle (where spread is)
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
    }
  }, [asks.length])

  const handlePriceClick = useCallback((price: number) => {
    setOrderPrice(price.toFixed(2))
  }, [setOrderPrice])

  // Determine price decimal places based on price magnitude
  const decimals = midPrice > 10000 ? 1 : midPrice > 100 ? 2 : midPrice > 1 ? 4 : 6

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-primary">Depth</span>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-text-muted">Pool</span>
          <span className="text-text-primary font-mono">${formatUsd(stats.poolAmount)}</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider border-b border-border shrink-0">
        <span className="flex-1">Price</span>
        <span className="flex-1 text-right">Size (USD)</span>
        <span className="flex-1 text-right">Total</span>
      </div>

      {/* Scrollable depth */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ contain: 'layout' }}>
        {/* Asks (sells) — red */}
        {asks.map((level, i) => (
          <DepthRow
            key={`ask-${i}`}
            price={level.price}
            size={level.size}
            total={level.total}
            percent={level.percent}
            side="ask"
            decimals={decimals}
            onClick={handlePriceClick}
          />
        ))}

        {/* Spread */}
        <div className="flex items-center justify-center px-3 py-1.5 border-y border-border bg-surface/50">
          <span className="text-sm font-mono font-bold text-text-primary">
            {midPrice > 0 ? midPrice.toFixed(decimals) : '---'}
          </span>
          {spread > 0 && (
            <span className="text-[10px] text-text-muted ml-2">
              Spread: {spread.toFixed(decimals)} ({spreadPercent.toFixed(3)}%)
            </span>
          )}
        </div>

        {/* Bids (buys) — green */}
        {bids.map((level, i) => (
          <DepthRow
            key={`bid-${i}`}
            price={level.price}
            size={level.size}
            total={level.total}
            percent={level.percent}
            side="bid"
            decimals={decimals}
            onClick={handlePriceClick}
          />
        ))}
      </div>
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
  const bgColor = side === 'ask' ? 'bg-short/8' : 'bg-long/8'
  const textColor = side === 'ask' ? 'text-short' : 'text-long'
  const barColor = side === 'ask' ? 'bg-short/15' : 'bg-long/15'

  return (
    <div
      onClick={() => onClick(price)}
      className="relative flex items-center px-3 py-[2px] text-xs font-mono cursor-pointer hover:bg-panel-light transition-colors"
    >
      {/* Depth bar */}
      <div
        className={cn('absolute inset-y-0 right-0', barColor)}
        style={{ width: `${percent * 100}%` }}
      />
      {/* Content */}
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

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}
