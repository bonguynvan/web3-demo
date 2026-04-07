/**
 * useSimulator — manages PriceSimulator + TickEngine pipeline.
 *
 * Architecture:
 *   PriceSimulator (1000+ ticks/s per pair)
 *     → TickEngine (zero-alloc ring buffer + OHLCV aggregator)
 *       → rAF flush (60/s) → Chart API (direct, no React)
 *                           → Store (15/s for React components)
 *
 * The TickEngine eliminates per-tick array allocation and filtering.
 * At 100 pairs × 100 ticks/s, only the selected market's ticks are
 * aggregated. Other pairs' ticks are counted but not processed.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  PriceSimulator,
  buildPairList,
  type SimulatorConfig,
} from '../lib/priceSimulator'
import { TickEngine, type FlushPayload } from '../lib/tickEngine'
import { useTradingStore, type MarketInfo } from '../store/tradingStore'
import type { CandleData } from '../types/trading'

interface SimulatorState {
  loading: boolean
  running: boolean
  pairCount: number
  ticksPerSecond: number
  fps: number
}

interface UseSimulatorOptions {
  enabled: boolean
  pairCount: number
  intervalMs: number
}

const TF_INTERVALS: Record<string, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000, '1d': 86_400_000, '1w': 604_800_000,
}

function generateSeedCandles(basePrice: number, count: number, intervalMs: number): CandleData[] {
  const now = Math.floor(Date.now() / intervalMs) * intervalMs
  const candles: CandleData[] = []
  let p = basePrice * (0.97 + Math.random() * 0.03)
  const volScale = Math.sqrt(intervalMs / 60_000)
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalMs
    const volatility = basePrice * 0.002 * volScale
    const change = (Math.random() - 0.48) * volatility
    const open = p
    p += change
    const close = p
    const high = Math.max(open, close) + Math.random() * volatility * 0.5
    const low = Math.min(open, close) - Math.random() * volatility * 0.5
    candles.push({ time, open, high, low, close, volume: Math.random() * 200 + 10 })
  }
  return candles
}

export function useSimulator({ enabled, pairCount, intervalMs }: UseSimulatorOptions): SimulatorState {
  const simRef = useRef<PriceSimulator | null>(null)
  const engineRef = useRef<TickEngine | null>(null)
  const seededMarketRef = useRef<string | null>(null)
  const tradeIdRef = useRef(0)

  const [state, setState] = useState<SimulatorState>({
    loading: true, running: false, pairCount: 0, ticksPerSecond: 0, fps: 0,
  })

  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const timeframe = useTradingStore(s => s.timeframe)
  const setCandles = useTradingStore(s => s.setCandles)
  const addCandle = useTradingStore(s => s.addCandle)
  const addTrade = useTradingStore(s => s.addTrade)
  const candleIntervalMs = TF_INTERVALS[timeframe] ?? 300_000

  // Seed candles on market change
  useEffect(() => {
    if (!enabled || !simRef.current) return
    const market = selectedMarket.symbol
    const key = `${market}:${timeframe}`
    if (seededMarketRef.current === key) return
    seededMarketRef.current = key

    const price = simRef.current.getPrice(market)
    if (price === 0) return

    const seed = generateSeedCandles(price, 300, candleIntervalMs)
    setCandles(seed)
    setState(s => ({ ...s, loading: false }))

    // Reset engine for new market
    engineRef.current?.setInterval(candleIntervalMs)
  }, [enabled, selectedMarket.symbol, timeframe, candleIntervalMs, setCandles])

  // Create/destroy simulator + engine
  useEffect(() => {
    if (!enabled) {
      simRef.current?.destroy()
      simRef.current = null
      engineRef.current?.stop()
      engineRef.current = null
      setState(s => ({ ...s, running: false, pairCount: 0, ticksPerSecond: 0 }))
      return
    }

    const pairs = buildPairList(pairCount)
    const config: SimulatorConfig = { intervalMs, pairsPerTick: pairs.length }

    const sim = new PriceSimulator(pairs, config)
    simRef.current = sim

    // Register markets
    const markets: MarketInfo[] = pairs.map(p => ({ symbol: p.symbol, baseAsset: p.baseAsset }))
    useTradingStore.setState({ markets, selectedMarket: markets[0] })

    // Create TickEngine
    const engine = new TickEngine()
    engineRef.current = engine

    let frameCount = 0

    engine.start(candleIntervalMs, (payload: FlushPayload) => {
      frameCount++

      // New completed candle → append to store
      if (payload.newCandleStarted && payload.completed) {
        addCandle({
          time: payload.completed.time,
          open: payload.completed.open,
          high: payload.completed.high,
          low: payload.completed.low,
          close: payload.completed.close,
          volume: payload.completed.volume,
        })
      }

      // Update store's last candle (throttled to 15fps for React)
      if (frameCount % 4 === 0) {
        const c = payload.current
        useTradingStore.setState(s => {
          if (s.candles.length === 0) {
            return { candles: [{ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }] }
          }
          const updated = [...s.candles]
          updated[updated.length - 1] = { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
          return { candles: updated }
        })
      }

      // Feed trade tape (max 2 per frame to avoid flooding)
      if (frameCount % 2 === 0 && payload.lastPrice > 0) {
        addTrade({
          id: `sim-${++tradeIdRef.current}`,
          price: +payload.lastPrice.toFixed(2),
          size: +(payload.ticksSinceFlush * 0.01 + Math.random() * 0.5).toFixed(4),
          side: payload.current.close >= payload.current.open ? 'long' : 'short',
          time: Date.now(),
        })
      }
    })

    // Wire simulator ticks → engine (only selected market's ticks)
    sim.onTick((ticks) => {
      const market = useTradingStore.getState().selectedMarket.symbol
      for (let i = 0; i < ticks.length; i++) {
        if (ticks[i].symbol === market) {
          engine.ingestTick(ticks[i].price, ticks[i].size, ticks[i].time)
        }
      }
    })

    sim.start()
    setState(s => ({ ...s, running: true, pairCount: pairs.length }))

    // Seed first market
    seededMarketRef.current = null

    setTimeout(() => {
      const market = useTradingStore.getState().selectedMarket.symbol
      const price = sim.getPrice(market)
      if (price > 0) {
        const key = `${market}:${useTradingStore.getState().timeframe}`
        if (seededMarketRef.current !== key) {
          seededMarketRef.current = key
          const seed = generateSeedCandles(price, 300, candleIntervalMs)
          useTradingStore.getState().setCandles(seed)
          setState(s => ({ ...s, loading: false }))
        }
      }
    }, 50)

    // Stats poll
    const statsInterval = setInterval(() => {
      setState(s => ({
        ...s,
        ticksPerSecond: Math.round(sim.getTicksPerSecond()),
        fps: Math.min(60, engine.flushCount),
      }))
      engine.flushCount = 0
    }, 1000)

    return () => {
      clearInterval(statsInterval)
      engine.stop()
      sim.destroy()
      simRef.current = null
      engineRef.current = null
    }
  }, [enabled, pairCount, intervalMs, candleIntervalMs, addCandle, addTrade])

  return state
}
