/**
 * useTradeFeed — generates a realistic stream of fake trades.
 *
 * Simulates trade flow that looks like a real exchange:
 * - Random intervals (50-800ms, clustered — bursts then quiet)
 * - Size follows power-law distribution (many small, few large)
 * - Side biased toward recent price direction
 * - Occasional large "whale" trades
 */

import { useEffect, useRef } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from './usePrices'
import type { Trade } from '../types/trading'

export function useTradeFeed() {
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const addTrade = useTradingStore(s => s.addTrade)
  const { getPrice } = usePrices()
  const intervalRef = useRef<ReturnType<typeof setTimeout>>()
  const tradeIdRef = useRef(0)
  const lastPriceRef = useRef(0)

  useEffect(() => {
    let active = true

    const generateTrade = () => {
      if (!active) return

      const currentPrice = getPrice(selectedMarket.symbol)
      const price = currentPrice?.price ?? lastPriceRef.current
      if (price === 0) {
        // No price yet — retry soon
        intervalRef.current = setTimeout(generateTrade, 1000)
        return
      }

      // Track direction
      const direction = price > lastPriceRef.current ? 'up' : 'down'
      lastPriceRef.current = price

      // Price with tiny spread variation
      const spreadNoise = price * (Math.random() - 0.5) * 0.0002
      const tradePrice = price + spreadNoise

      // Size: power-law — most trades are small, occasional whale
      const r = Math.random()
      let size: number
      if (r < 0.6) {
        size = 0.01 + Math.random() * 0.5 // small: 0.01 - 0.5
      } else if (r < 0.9) {
        size = 0.5 + Math.random() * 5 // medium: 0.5 - 5
      } else if (r < 0.98) {
        size = 5 + Math.random() * 20 // large: 5 - 25
      } else {
        size = 20 + Math.random() * 100 // whale: 20 - 120
      }

      // Side biased toward price direction (60/40 split)
      const sideBias = direction === 'up' ? 0.6 : 0.4
      const side = Math.random() < sideBias ? 'long' : 'short'

      const trade: Trade = {
        id: `t-${++tradeIdRef.current}`,
        price: +tradePrice.toFixed(2),
        size: +size.toFixed(4),
        side: side as 'long' | 'short',
        time: Date.now(),
      }

      addTrade(trade)

      // Next trade interval: clustered (bursts of activity then quiet)
      const burstPhase = Math.sin(Date.now() / 3000) > 0 // 3s burst cycles
      const baseInterval = burstPhase ? 80 : 400
      const jitter = Math.random() * baseInterval
      const nextInterval = baseInterval + jitter

      intervalRef.current = setTimeout(generateTrade, nextInterval)
    }

    // Start after a short delay
    intervalRef.current = setTimeout(generateTrade, 500)

    return () => {
      active = false
      clearTimeout(intervalRef.current)
    }
  }, [selectedMarket.symbol, getPrice, addTrade])
}
