/**
 * useMarketWs — builds OHLC candles from oracle price updates.
 *
 * Creates proper candles by:
 * 1. Seeding ~50 historical candles on first price (so chart isn't empty)
 * 2. Opening new candles at bucket boundaries
 * 3. Updating the current candle's high/low/close on each tick
 */

import { useEffect, useRef } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from './usePrices'
import type { CandleData } from '../types/trading'

const CANDLE_INTERVAL_MS = 5_000 // 5-second candles

interface UseMarketWsOptions {
  wsUrl: string | null
  market: string
}

export function useMarketWs({ wsUrl: _wsUrl, market }: UseMarketWsOptions) {
  const { getPrice } = usePrices()
  const addCandle = useTradingStore(s => s.addCandle)
  const setCandles = useTradingStore(s => s.setCandles)
  const candles = useTradingStore(s => s.candles)

  const currentPrice = getPrice(market)
  const seededRef = useRef(false)
  const currentCandleRef = useRef<CandleData | null>(null)

  // Seed historical candles on first price (so chart isn't empty)
  useEffect(() => {
    if (!currentPrice || currentPrice.price === 0 || seededRef.current) return
    seededRef.current = true

    const price = currentPrice.price
    const now = Math.floor(Date.now() / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
    const seed: CandleData[] = []

    // Generate 60 historical candles with realistic random walk
    let p = price * (0.97 + Math.random() * 0.03) // start slightly off
    for (let i = 59; i >= 0; i--) {
      const time = (now - i * CANDLE_INTERVAL_MS) / 1000
      const change = (Math.random() - 0.48) * price * 0.002
      const open = p
      p = p + change
      const close = p
      const high = Math.max(open, close) + Math.random() * price * 0.001
      const low = Math.min(open, close) - Math.random() * price * 0.001
      seed.push({
        time,
        open,
        high,
        low,
        close,
        volume: Math.random() * 200 + 10,
      })
    }

    // Current candle
    const currentTime = now / 1000
    const current: CandleData = {
      time: currentTime,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 1,
    }
    seed.push(current)
    currentCandleRef.current = current

    setCandles(seed)
  }, [currentPrice, setCandles])

  // Update candles on each price tick
  useEffect(() => {
    if (!currentPrice || currentPrice.price === 0 || !seededRef.current) return

    const price = currentPrice.price
    const now = Math.floor(Date.now() / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
    const bucketTime = now / 1000

    const current = currentCandleRef.current

    if (!current || bucketTime > current.time) {
      // New candle bucket
      const newCandle: CandleData = {
        time: bucketTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 1,
      }
      currentCandleRef.current = newCandle
      addCandle(newCandle)
    } else {
      // Update current candle (OHLC)
      current.high = Math.max(current.high, price)
      current.low = Math.min(current.low, price)
      current.close = price
      current.volume += 1

      // Trigger store update by replacing the last candle
      useTradingStore.setState(state => {
        if (state.candles.length === 0) return state
        const updated = [...state.candles]
        updated[updated.length - 1] = { ...current }
        return { candles: updated }
      })
    }
  }, [currentPrice, addCandle])
}
