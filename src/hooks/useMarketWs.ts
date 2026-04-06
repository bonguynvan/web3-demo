/**
 * useMarketWs — builds OHLC candles from oracle prices or simulated data.
 *
 * Two modes:
 * 1. Oracle mode: if on-chain prices are available, seeds history from them
 * 2. Simulation mode: if no oracle price within 5s, generates realistic
 *    market data so the chart works as a demo without keepers running
 *
 * Timestamps are in MILLISECONDS (chart library uses `new Date(time)`).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from './usePrices'
import type { CandleData } from '../types/trading'

const CANDLE_INTERVAL_MS = 5_000 // 5-second candles

// Realistic base prices for demo mode
const BASE_PRICES: Record<string, number> = {
  'ETH-PERP': 3450,
  'BTC-PERP': 68500,
}

interface UseMarketWsOptions {
  wsUrl: string | null
  market: string
  /** Disable this hook (e.g., when simulator is active) */
  disabled?: boolean
}

/** Generate seed candles with random walk from a starting price */
function generateSeedCandles(basePrice: number, count: number, intervalMs: number): CandleData[] {
  const now = Math.floor(Date.now() / intervalMs) * intervalMs
  const candles: CandleData[] = []

  let p = basePrice * (0.97 + Math.random() * 0.03)
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalMs // milliseconds
    const volatility = basePrice * 0.002
    const change = (Math.random() - 0.48) * volatility
    const open = p
    p = p + change
    const close = p
    const high = Math.max(open, close) + Math.random() * volatility * 0.5
    const low = Math.min(open, close) - Math.random() * volatility * 0.5
    candles.push({ time, open, high, low, close, volume: Math.random() * 200 + 10 })
  }
  return candles
}

export function useMarketWs({ wsUrl: _wsUrl, market, disabled }: UseMarketWsOptions) {
  const { getPrice } = usePrices()
  const addCandle = useTradingStore(s => s.addCandle)
  const setCandles = useTradingStore(s => s.setCandles)

  const currentPrice = disabled ? undefined : getPrice(market)
  const seededRef = useRef<string | null>(null)
  const currentCandleRef = useRef<CandleData | null>(null)
  const simIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const simPriceRef = useRef(0)
  const [loading, setLoading] = useState(true)

  // When disabled, stop everything
  useEffect(() => {
    if (disabled) {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current)
        simIntervalRef.current = null
      }
      seededRef.current = null
      currentCandleRef.current = null
    }
  }, [disabled])

  // Cleanup simulation on unmount
  useEffect(() => {
    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current)
    }
  }, [])

  // Reset on market change
  useEffect(() => {
    seededRef.current = null
    currentCandleRef.current = null
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current)
      simIntervalRef.current = null
    }
    setCandles([])
    setLoading(true)
  }, [market, setCandles])

  // Seed from oracle price
  const seedFromPrice = useCallback((price: number) => {
    if (seededRef.current === market) return
    seededRef.current = market

    const seed = generateSeedCandles(price, 60, CANDLE_INTERVAL_MS)

    // Add current candle
    const now = Math.floor(Date.now() / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
    const current: CandleData = {
      time: now,
      open: price, high: price, low: price, close: price,
      volume: 1,
    }
    seed.push(current)
    currentCandleRef.current = current

    setCandles(seed)
    setLoading(false)
  }, [market, setCandles])

  // Try oracle price first
  useEffect(() => {
    if (!currentPrice || currentPrice.price === 0 || seededRef.current === market) return
    seedFromPrice(currentPrice.price)
  }, [currentPrice, market, seedFromPrice])

  // Fallback: if no oracle price within 3s, start simulation mode
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (seededRef.current === market) return // already seeded from oracle

      const basePrice = BASE_PRICES[market] ?? 1000
      seedFromPrice(basePrice)
      simPriceRef.current = basePrice

      // Start simulation tick every 500ms
      simIntervalRef.current = setInterval(() => {
        const volatility = simPriceRef.current * 0.0003
        const change = (Math.random() - 0.48) * volatility
        simPriceRef.current += change

        const price = simPriceRef.current
        const now = Math.floor(Date.now() / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
        const current = currentCandleRef.current

        if (!current || now > current.time) {
          // New candle
          const newCandle: CandleData = {
            time: now,
            open: price, high: price, low: price, close: price,
            volume: Math.random() * 20 + 1,
          }
          currentCandleRef.current = newCandle
          addCandle(newCandle)
        } else {
          // Update current
          current.high = Math.max(current.high, price)
          current.low = Math.min(current.low, price)
          current.close = price
          current.volume += 1
          useTradingStore.setState(state => {
            if (state.candles.length === 0) return state
            const updated = [...state.candles]
            updated[updated.length - 1] = { ...current }
            return { candles: updated }
          })
        }
      }, 500)
    }, 3000)

    return () => clearTimeout(timeout)
  }, [market, seedFromPrice, addCandle])

  // Update candles from live oracle ticks
  useEffect(() => {
    if (!currentPrice || currentPrice.price === 0 || seededRef.current !== market) return
    // If simulation is running, stop it — real data is flowing
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current)
      simIntervalRef.current = null
    }

    const price = currentPrice.price
    const now = Math.floor(Date.now() / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
    const current = currentCandleRef.current

    if (!current || now > current.time) {
      const newCandle: CandleData = {
        time: now,
        open: price, high: price, low: price, close: price,
        volume: 1,
      }
      currentCandleRef.current = newCandle
      addCandle(newCandle)
    } else {
      current.high = Math.max(current.high, price)
      current.low = Math.min(current.low, price)
      current.close = price
      current.volume += 1
      useTradingStore.setState(state => {
        if (state.candles.length === 0) return state
        const updated = [...state.candles]
        updated[updated.length - 1] = { ...current }
        return { candles: updated }
      })
    }
  }, [currentPrice, market, addCandle])

  return { loading }
}
