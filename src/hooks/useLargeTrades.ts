/**
 * useLargeTrades — sliding buffer of recent above-threshold trades.
 *
 * Subscribes to the active venue's trades stream for the selected
 * market and keeps the last N trades whose USD notional exceeds the
 * threshold. Used by useSignals to derive whale-flow signals.
 *
 * Hyperliquid implements subscribeTrades; Binance currently stubs it,
 * so this hook returns [] when binance is active. Switching venues
 * resets the buffer.
 */

import { useEffect, useState } from 'react'
import { getActiveAdapter } from '../adapters/registry'
import { useActiveVenue } from './useActiveVenue'
import { useTradingStore } from '../store/tradingStore'
import type { PublicTrade } from '../adapters/types'

const DEFAULT_THRESHOLD_USD = 50_000
const BUFFER_SIZE = 50
const MAX_AGE_MS = 5 * 60 * 1000  // 5 min — older trades expire from the buffer

export function useLargeTrades(threshold = DEFAULT_THRESHOLD_USD): PublicTrade[] {
  const venueId = useActiveVenue()
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const [trades, setTrades] = useState<PublicTrade[]>([])

  useEffect(() => {
    setTrades([])
    const adapter = getActiveAdapter()
    const unsub = adapter.subscribeTrades(selectedMarket.symbol, (trade) => {
      const notional = trade.price * trade.size
      if (notional < threshold) return
      const now = Date.now()
      setTrades(prev => {
        const fresh = prev.filter(t => now - t.timestamp < MAX_AGE_MS)
        // Dedup by id (HL emits the same tid sometimes on reconnect)
        if (fresh.some(t => t.id === trade.id)) return fresh
        return [...fresh, trade].slice(-BUFFER_SIZE)
      })
    })
    return unsub
  }, [venueId, selectedMarket.symbol, threshold])

  return trades
}
