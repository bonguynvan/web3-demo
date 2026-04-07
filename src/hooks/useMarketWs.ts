/**
 * useMarketWs — builds OHLC candles from oracle prices or simulated data.
 *
 * Reads the selected timeframe from the store and generates candles
 * at the correct interval. When timeframe changes, reseeds history.
 *
 * Two modes:
 * 1. Oracle mode: if on-chain prices are available, seeds history from them
 * 2. Simulation mode: if no oracle price within 3s, generates realistic
 *    market data so the chart works as a demo without keepers running
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from './usePrices'
import type { CandleData } from '../types/trading'
import type { TimeFrame } from '@chart-lib/library'

// Timeframe → candle interval in milliseconds
const TF_INTERVALS: Record<string, number> = {
  '1m':  60_000,
  '3m':  180_000,
  '5m':  300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h':  3_600_000,
  '2h':  7_200_000,
  '4h':  14_400_000,
  '1d':  86_400_000,
  '1w':  604_800_000,
}

function getIntervalMs(tf: TimeFrame): number {
  return TF_INTERVALS[tf] ?? 300_000 // default 5m
}

// Realistic base prices for demo mode
const BASE_PRICES: Record<string, number> = {
  'ETH-PERP': 3450,
  'BTC-PERP': 68500,
}

interface UseMarketWsOptions {
  wsUrl: string | null
  market: string
  disabled?: boolean
}

/** Generate seed candles with random walk */
function generateSeedCandles(basePrice: number, count: number, intervalMs: number): CandleData[] {
  const now = Math.floor(Date.now() / intervalMs) * intervalMs
  const candles: CandleData[] = []

  let p = basePrice * (0.97 + Math.random() * 0.03)
  // Scale volatility to interval — larger intervals get proportionally larger moves
  const volScale = Math.sqrt(intervalMs / 60_000) // sqrt scaling (like real markets)

  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalMs
    const volatility = basePrice * 0.002 * volScale
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
  const timeframe = useTradingStore(s => s.timeframe)

  const currentPrice = disabled ? undefined : getPrice(market)
  const seededRef = useRef<string | null>(null) // "market:timeframe" key
  const currentCandleRef = useRef<CandleData | null>(null)
  const simIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const simPriceRef = useRef(0)
  const [loading, setLoading] = useState(true)

  const intervalMs = getIntervalMs(timeframe)
  const seedKey = `${market}:${timeframe}`

  // Cleanup sim on disable
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current)
    }
  }, [])

  // Reset on market OR timeframe change
  useEffect(() => {
    seededRef.current = null
    currentCandleRef.current = null
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current)
      simIntervalRef.current = null
    }
    setCandles([])
    setLoading(true)
  }, [market, timeframe, setCandles])

  // Seed from a given price
  const seedFromPrice = useCallback((price: number) => {
    if (seededRef.current === seedKey) return
    seededRef.current = seedKey

    // Seed enough candles to fill the chart width (~300 is typical screen width in bars)
    const candleCount = 300
    const seed = generateSeedCandles(price, candleCount, intervalMs)

    // Add current candle
    const now = Math.floor(Date.now() / intervalMs) * intervalMs
    const current: CandleData = {
      time: now,
      open: price, high: price, low: price, close: price,
      volume: 1,
    }
    seed.push(current)
    currentCandleRef.current = current

    setCandles(seed)
    setLoading(false)
  }, [seedKey, intervalMs, setCandles])

  // Try oracle price first
  useEffect(() => {
    if (!currentPrice || currentPrice.price === 0 || seededRef.current === seedKey) return
    seedFromPrice(currentPrice.price)
  }, [currentPrice, seedKey, seedFromPrice])

  // Fallback: simulation mode if no oracle price within 3s
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (seededRef.current === seedKey) return

      const basePrice = BASE_PRICES[market] ?? 1000
      seedFromPrice(basePrice)
      simPriceRef.current = basePrice

      // Sim ticks — faster for small timeframes, slower for large
      const simTickMs = Math.min(500, intervalMs / 10)

      simIntervalRef.current = setInterval(() => {
        const volScale = Math.sqrt(intervalMs / 60_000)
        const volatility = simPriceRef.current * 0.0003 * volScale
        const change = (Math.random() - 0.48) * volatility
        simPriceRef.current += change

        const price = simPriceRef.current
        updateCandle(price, intervalMs, addCandle, currentCandleRef)
      }, simTickMs)
    }, 3000)

    return () => clearTimeout(timeout)
  }, [market, seedKey, seedFromPrice, intervalMs, addCandle])

  // Update candles from live oracle ticks
  useEffect(() => {
    if (!currentPrice || currentPrice.price === 0 || seededRef.current !== seedKey) return
    // Real data flowing — stop simulation
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current)
      simIntervalRef.current = null
    }

    updateCandle(currentPrice.price, intervalMs, addCandle, currentCandleRef)
  }, [currentPrice, seedKey, intervalMs, addCandle])

  return { loading }
}

/** Update or create a candle at the current time bucket */
function updateCandle(
  price: number,
  intervalMs: number,
  addCandle: (c: CandleData) => void,
  currentCandleRef: React.MutableRefObject<CandleData | null>,
) {
  const now = Math.floor(Date.now() / intervalMs) * intervalMs
  const current = currentCandleRef.current

  if (!current || now > current.time) {
    // New candle bucket
    const newCandle: CandleData = {
      time: now,
      open: price, high: price, low: price, close: price,
      volume: Math.random() * 20 + 1,
    }
    currentCandleRef.current = newCandle
    addCandle(newCandle)
  } else {
    // Update existing candle
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
}
