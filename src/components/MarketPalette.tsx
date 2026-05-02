/**
 * MarketPalette — Cmd/Ctrl+K command palette for jumping between markets.
 *
 * Venue-agnostic: reads markets from tradingStore which is populated by
 * whichever VenueAdapter is currently active. Adding a new CEX/DEX
 * venue requires no changes here.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { useActiveVenue } from '../hooks/useActiveVenue'
import { Search, Clock } from 'lucide-react'
import { cn } from '../lib/format'

const RECENT_KEY = 'tc-recent-markets-v1'
const RECENT_MAX = 5

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX)
  } catch { return [] }
}

function pushRecent(symbol: string): string[] {
  const cur = loadRecent().filter(s => s !== symbol)
  const next = [symbol, ...cur].slice(0, RECENT_MAX)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* full */ }
  return next
}

export function MarketPalette() {
  const markets = useTradingStore(s => s.markets)
  const setSelectedMarket = useTradingStore(s => s.setSelectedMarket)
  const venue = useActiveVenue()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [recent, setRecent] = useState<string[]>(() => loadRecent())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        return
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIdx(0)
    queueMicrotask(() => inputRef.current?.focus())
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? markets.filter(m =>
        m.symbol.toLowerCase().includes(q) || m.baseAsset.toLowerCase().includes(q))
      : markets
    return list.slice(0, 30)
  }, [markets, query])

  if (!open) return null

  const select = (symbol: string) => {
    setSelectedMarket(symbol)
    setRecent(pushRecent(symbol))
    setOpen(false)
  }

  const onListKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const m = filtered[activeIdx]
      if (m) select(m.symbol)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-24 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md bg-panel border border-border rounded-lg shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
            onKeyDown={onListKey}
            placeholder={`Search markets on ${venue}…`}
            className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-muted"
          />
          <span className="text-[10px] text-text-muted bg-surface border border-border rounded px-1.5 py-0.5">
            Esc
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {query.trim() === '' && recent.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-wider text-text-muted flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Recent
              </div>
              {recent
                .map(sym => markets.find(m => m.symbol === sym))
                .filter((m): m is typeof markets[number] => Boolean(m))
                .map(m => (
                  <button
                    key={`recent-${m.symbol}`}
                    onClick={() => select(m.symbol)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left text-xs cursor-pointer text-text-secondary hover:bg-panel-light transition-colors"
                  >
                    <span className="font-mono">{m.symbol}</span>
                    <span className="text-text-muted">{m.baseAsset}</span>
                  </button>
                ))}
              <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-wider text-text-muted border-t border-border">
                All markets
              </div>
            </>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-text-muted text-center">No markets match</div>
          ) : filtered.map((m, i) => (
            <button
              key={m.symbol}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => select(m.symbol)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-left text-xs cursor-pointer transition-colors',
                i === activeIdx ? 'bg-accent-dim text-text-primary' : 'text-text-secondary hover:bg-panel-light',
              )}
            >
              <span className="font-mono">{m.symbol}</span>
              <span className="text-text-muted">{m.baseAsset}</span>
            </button>
          ))}
        </div>
        <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-muted flex items-center justify-between">
          <span>↑↓ navigate · ↵ select</span>
          <span>{filtered.length} of {markets.length}</span>
        </div>
      </div>
    </div>
  )
}
