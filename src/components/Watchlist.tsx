/**
 * Watchlist — pinned markets with live ticker price + 24h change.
 *
 * Click row to focus the chart on that market. X to unpin. Hold and
 * drag the grip handle to reorder. Empty state hints at the pin
 * button in the header.
 */

import { useEffect, useState, useRef } from 'react'
import { Star, X, GripVertical } from 'lucide-react'
import { useWatchlistStore } from '../store/watchlistStore'
import { useTradingStore } from '../store/tradingStore'
import { getActiveAdapter } from '../adapters/registry'
import { cn, formatUsd } from '../lib/format'

const TICK_MS = 1500

export function Watchlist() {
  const symbols = useWatchlistStore(s => s.symbols)
  const remove = useWatchlistStore(s => s.remove)
  const reorder = useWatchlistStore(s => s.reorder)
  const setSelectedMarket = useTradingStore(s => s.setSelectedMarket)
  const selected = useTradingStore(s => s.selectedMarket.symbol)
  const [, force] = useState(0)
  const dragFrom = useRef<number | null>(null)

  // Heartbeat — re-render to pull fresh prices from the adapter ticker
  // cache. The cache itself is updated by the existing market WS feeds.
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])

  if (symbols.length === 0) {
    return (
      <div className="px-3 py-3 text-[10px] text-text-muted leading-relaxed border-b border-border">
        <div className="flex items-center gap-1.5 mb-1 text-text-secondary text-[11px] font-semibold">
          <Star className="w-3 h-3" />
          Watchlist
        </div>
        Pin markets from the header to track them here.
      </div>
    )
  }

  return (
    <div className="border-b border-border">
      <div className="px-3 py-1.5 flex items-center justify-between text-text-secondary text-[11px] font-semibold">
        <span className="flex items-center gap-1.5">
          <Star className="w-3 h-3" />
          Watchlist
        </span>
        <span className="text-[10px] text-text-muted font-normal">{symbols.length}</span>
      </div>

      <div>
        {symbols.map((sym, idx) => {
          const ticker = getActiveAdapter().getTicker(sym)
          const price = ticker?.price ?? 0
          const change = ticker?.change24hPct ?? 0
          const changeColor = change >= 0 ? 'text-long' : 'text-short'
          const isActive = sym === selected

          return (
            <div
              key={sym}
              draggable
              onDragStart={() => { dragFrom.current = idx }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current !== null && dragFrom.current !== idx) {
                  reorder(dragFrom.current, idx)
                }
                dragFrom.current = null
              }}
              onDragEnd={() => { dragFrom.current = null }}
              className={cn(
                'group flex items-center gap-2 px-3 py-1.5 hover:bg-panel-light cursor-pointer transition-colors',
                isActive && 'bg-panel-light',
              )}
              onClick={() => setSelectedMarket(sym)}
            >
              <GripVertical className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 cursor-grab shrink-0" />
              <div className="flex-1 min-w-0">
                <div className={cn('text-[11px] font-medium truncate', isActive ? 'text-accent' : 'text-text-primary')}>
                  {sym}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] font-mono tabular-nums text-text-primary">
                  {price > 0 ? `$${formatUsd(price)}` : '---'}
                </div>
                <div className={cn('text-[9px] font-mono tabular-nums', changeColor)}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); remove(sym) }}
                title="Unpin"
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-muted hover:text-short transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
