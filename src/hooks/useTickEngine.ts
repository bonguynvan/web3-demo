/**
 * useTickEngine — connects TickEngine to chart and store.
 *
 * Replaces the direct store subscription approach with a proper pipeline:
 *   Ticks → TickEngine (zero-alloc) → rAF flush → Chart API + Store
 *
 * The chart is updated DIRECTLY (bypassing React) for maximum performance.
 * The store is updated less frequently for React components (trade tape, etc.)
 */

import { useEffect, useRef, useCallback } from 'react'
import { TickEngine, type FlushPayload, type TickCandle } from '../lib/tickEngine'
import { useTradingStore } from '../store/tradingStore'
import type { Chart } from '@tradecanvas/chart'
import type { CandleData } from '../types/trading'

interface UseTickEngineOptions {
  /** Ref to the chart instance (updated directly, bypassing React) */
  chartRef: React.RefObject<Chart | null>
  /** Whether the engine is active */
  enabled: boolean
}

/**
 * Returns an `ingest(price, volume?)` function that feeds ticks into the engine.
 * The engine handles aggregation, candle creation, and chart updates at 60fps.
 */
export function useTickEngine({ chartRef, enabled }: UseTickEngineOptions) {
  const engineRef = useRef<TickEngine | null>(null)
  const candleCountRef = useRef(0)
  const timeframe = useTradingStore(s => s.timeframe)

  // Timeframe → interval ms mapping
  const intervalMs = getIntervalMs(timeframe)

  useEffect(() => {
    if (!enabled) {
      engineRef.current?.stop()
      engineRef.current = null
      return
    }

    const engine = new TickEngine()
    engineRef.current = engine

    engine.start(intervalMs, (payload: FlushPayload) => {
      const chart = chartRef.current
      if (!chart) return

      // 1. If a new candle completed, append it to the chart
      if (payload.newCandleStarted && payload.completed) {
        chart.appendBar(tickCandleToOHLC(payload.completed))
        candleCountRef.current++

        // Also push to store (for other components, throttled)
        useTradingStore.getState().addCandle(tickCandleToStoreCandle(payload.completed))
      }

      // 2. Update the current (in-progress) candle on the chart
      chart.updateLastBar(tickCandleToOHLC(payload.current))

      // 3. Update price line
      chart.setCurrentPrice(payload.lastPrice)

      // 4. Update store's last candle (throttled — only every 4th frame = 15fps for React)
      if (engine.flushCount % 4 === 0) {
        const storeCandle = tickCandleToStoreCandle(payload.current)
        useTradingStore.setState(state => {
          if (state.candles.length === 0) return { candles: [storeCandle] }
          const updated = [...state.candles]
          updated[updated.length - 1] = storeCandle
          return { candles: updated }
        })
      }
    })

    return () => {
      engine.stop()
      engineRef.current = null
    }
  }, [enabled, intervalMs, chartRef])

  // Handle timeframe changes
  useEffect(() => {
    engineRef.current?.setInterval(intervalMs)
  }, [intervalMs])

  // Ingest function — stable reference, safe to call from any frequency
  const ingest = useCallback((price: number, volume?: number, timestamp?: number) => {
    engineRef.current?.ingestTick(price, volume ?? 1, timestamp ?? Date.now())
  }, [])

  // Get stats
  const getStats = useCallback(() => {
    return engineRef.current?.getRecentStats() ?? { avgPrice: 0, minPrice: 0, maxPrice: 0, tickRate: 0 }
  }, [])

  return { ingest, getStats, engine: engineRef }
}

// ─── Helpers ───

function tickCandleToOHLC(c: TickCandle) {
  return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
}

function tickCandleToStoreCandle(c: TickCandle): CandleData {
  return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
}

const TF_INTERVALS: Record<string, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000, '1d': 86_400_000, '1w': 604_800_000,
}

function getIntervalMs(tf: string): number {
  return TF_INTERVALS[tf] ?? 300_000
}
