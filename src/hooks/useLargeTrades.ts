/**
 * useLargeTrades — sliding buffer of recent above-threshold trades.
 *
 * Subscribes to the active venue's trades stream for the top N markets
 * by 24h volume and keeps the last N trades whose USD notional exceeds
 * the threshold. Used by useSignals to derive whale-flow signals
 * across every actively-traded market, not just the one being charted.
 *
 * Hyperliquid implements subscribeTrades; Binance currently stubs it,
 * so this hook returns [] when binance is active. Switching venues
 * resets the buffer.
 */

import { useEffect, useState } from 'react'
import { getActiveAdapter } from '../adapters/registry'
import { useActiveVenue } from './useActiveVenue'
import { useTradingStore } from '../store/tradingStore'
import type { PublicTrade, Unsubscribe } from '../adapters/types'

const DEFAULT_THRESHOLD_USD = 50_000
const TRACKED_MARKETS = 10                // top N by 24h volume
const BUFFER_SIZE = 200                   // wider stream → larger buffer
const MAX_AGE_MS = 5 * 60 * 1000          // 5 min — older trades expire from the buffer

export function useLargeTrades(threshold = DEFAULT_THRESHOLD_USD): PublicTrade[] {
  const venueId = useActiveVenue()
  const markets = useTradingStore(s => s.markets)
  const [trades, setTrades] = useState<PublicTrade[]>([])

  // Stable key so the effect only re-subscribes when the top-N watchlist
  // actually changes — not on every markets array reallocation.
  const watchlistKey = markets.slice(0, TRACKED_MARKETS).map(m => m.symbol).join(',')

  useEffect(() => {
    setTrades([])
    const adapter = getActiveAdapter()
    const targets = markets.slice(0, TRACKED_MARKETS)
    const unsubs: Unsubscribe[] = []

    for (const m of targets) {
      const unsub = adapter.subscribeTrades(m.symbol, (trade) => {
        const notional = trade.price * trade.size
        if (notional < threshold) return
        const now = Date.now()
        setTrades(prev => {
          const fresh = prev.filter(t => now - t.timestamp < MAX_AGE_MS)
          if (fresh.some(t => t.id === trade.id)) return fresh
          return [...fresh, trade].slice(-BUFFER_SIZE)
        })
      })
      unsubs.push(unsub)
    }

    return () => { for (const u of unsubs) u() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, threshold, watchlistKey])

  return trades
}
