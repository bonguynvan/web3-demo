/**
 * useMarketWs — price feed hook.
 *
 * In Phase 7a: prices come from usePrices hook (polling PriceFeed contract).
 * In Phase 7b: will connect to backend WebSocket for push-based updates.
 *
 * This hook now generates candle data from oracle price updates.
 */

import { useEffect, useRef } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from './usePrices'

interface UseMarketWsOptions {
  wsUrl: string | null
  market: string
}

export function useMarketWs({ wsUrl: _wsUrl, market }: UseMarketWsOptions) {
  const { getPrice } = usePrices()
  const addCandle = useTradingStore(s => s.addCandle)
  const lastCandleTimeRef = useRef(0)

  const currentPrice = getPrice(market)

  // Build candles from price updates (5-second candles for demo)
  useEffect(() => {
    if (!currentPrice || currentPrice.price === 0) return

    const now = Math.floor(Date.now() / 5000) * 5000 // 5-second buckets
    const price = currentPrice.price

    if (now > lastCandleTimeRef.current) {
      // New candle
      addCandle({
        time: now / 1000,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: Math.random() * 100,
      })
      lastCandleTimeRef.current = now
    }
  }, [currentPrice, addCandle])
}
