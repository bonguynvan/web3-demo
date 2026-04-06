/**
 * useSimulator — manages PriceSimulator lifecycle and feeds ticks into the store.
 *
 * Handles:
 * - Batching ticks per animation frame (avoids 100+ setState/sec)
 * - Building candles from raw ticks for the selected market
 * - Feeding the trade tape for the selected market
 * - Providing simulated prices for all pairs (for MarketInfo/Header)
 * - FPS and tick rate stats for the dev overlay
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  PriceSimulator,
  buildPairList,
  type PriceTick,
  type SimulatorConfig,
} from '../lib/priceSimulator'
import { useTradingStore, type MarketInfo } from '../store/tradingStore'
import type { CandleData } from '../types/trading'

const CANDLE_INTERVAL_MS = 5_000

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

/** Generate seed candles with random walk from a starting price */
function generateSeedCandles(basePrice: number, count: number): CandleData[] {
  const now = Math.floor(Date.now() / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
  const candles: CandleData[] = []
  let p = basePrice * (0.97 + Math.random() * 0.03)
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * CANDLE_INTERVAL_MS
    const volatility = basePrice * 0.002
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
  const currentCandleRef = useRef<CandleData | null>(null)
  const seededMarketRef = useRef<string | null>(null)
  const tickBufferRef = useRef<PriceTick[]>([])
  const rafIdRef = useRef(0)
  const fpsRef = useRef({ frames: 0, lastTime: Date.now(), value: 0 })

  const [state, setState] = useState<SimulatorState>({
    loading: true,
    running: false,
    pairCount: 0,
    ticksPerSecond: 0,
    fps: 0,
  })

  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const setCandles = useTradingStore(s => s.setCandles)
  const addCandle = useTradingStore(s => s.addCandle)
  const addTrade = useTradingStore(s => s.addTrade)

  // Process buffered ticks on animation frame — this is the key optimization
  const flushTicks = useCallback(() => {
    rafIdRef.current = 0
    const ticks = tickBufferRef.current
    if (ticks.length === 0) return
    tickBufferRef.current = []

    // FPS tracking
    const fps = fpsRef.current
    fps.frames++
    const now = Date.now()
    if (now - fps.lastTime >= 1000) {
      fps.value = fps.frames
      fps.frames = 0
      fps.lastTime = now
    }

    const market = useTradingStore.getState().selectedMarket.symbol

    // Filter ticks for the selected market
    const marketTicks = ticks.filter(t => t.symbol === market)
    if (marketTicks.length === 0) return

    // Use last tick as the "current price" for the candle
    const lastTick = marketTicks[marketTicks.length - 1]

    // Build/update candle
    const bucketTime = Math.floor(now / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
    let current = currentCandleRef.current

    if (!current || bucketTime > current.time) {
      // New candle
      const newCandle: CandleData = {
        time: bucketTime,
        open: lastTick.price,
        high: lastTick.price,
        low: lastTick.price,
        close: lastTick.price,
        volume: marketTicks.reduce((s, t) => s + t.size, 0),
      }
      currentCandleRef.current = newCandle
      addCandle(newCandle)
    } else {
      // Merge all market ticks into current candle
      for (const tick of marketTicks) {
        current.high = Math.max(current.high, tick.price)
        current.low = Math.min(current.low, tick.price)
        current.close = tick.price
        current.volume += tick.size
      }
      // Batch update — single setState
      useTradingStore.setState(s => {
        if (s.candles.length === 0) return s
        const updated = [...s.candles]
        updated[updated.length - 1] = { ...current! }
        return { candles: updated }
      })
    }

    // Feed trade tape (only last few ticks to avoid flooding)
    const tradeTicks = marketTicks.slice(-3)
    for (const tick of tradeTicks) {
      addTrade({
        id: `${tick.time}-${Math.random().toString(36).slice(2, 8)}`,
        price: tick.price,
        size: tick.size,
        side: tick.side,
        time: tick.time,
      })
    }
  }, [addCandle, addTrade])

  // Seed candles when market changes
  useEffect(() => {
    if (!enabled || !simRef.current) return

    const market = selectedMarket.symbol
    if (seededMarketRef.current === market) return
    seededMarketRef.current = market
    currentCandleRef.current = null

    const price = simRef.current.getPrice(market)
    if (price === 0) return

    const seed = generateSeedCandles(price, 60)
    const now = Math.floor(Date.now() / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
    const current: CandleData = {
      time: now,
      open: price, high: price, low: price, close: price,
      volume: 1,
    }
    seed.push(current)
    currentCandleRef.current = current
    setCandles(seed)
    setState(s => ({ ...s, loading: false }))
  }, [enabled, selectedMarket.symbol, setCandles])

  // Create/destroy simulator
  useEffect(() => {
    if (!enabled) {
      if (simRef.current) {
        simRef.current.destroy()
        simRef.current = null
      }
      setState(s => ({ ...s, running: false, pairCount: 0, ticksPerSecond: 0 }))
      return
    }

    const pairs = buildPairList(pairCount)
    const config: SimulatorConfig = { intervalMs, pairsPerTick: pairs.length }

    const sim = new PriceSimulator(pairs, config)
    simRef.current = sim

    // Register available markets in the store
    const markets: MarketInfo[] = pairs.map(p => ({
      symbol: p.symbol,
      baseAsset: p.baseAsset,
    }))
    useTradingStore.setState({ markets, selectedMarket: markets[0] })

    // Seed the first market immediately
    seededMarketRef.current = null

    sim.onTick((ticks) => {
      tickBufferRef.current.push(...ticks)
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(flushTicks)
      }
    })

    sim.start()
    setState(s => ({ ...s, running: true, pairCount: pairs.length }))

    // Seed initial candles after a brief delay for first ticks to flow
    setTimeout(() => {
      const market = useTradingStore.getState().selectedMarket.symbol
      const price = sim.getPrice(market)
      if (price > 0 && seededMarketRef.current !== market) {
        seededMarketRef.current = market
        currentCandleRef.current = null
        const seed = generateSeedCandles(price, 60)
        const now = Math.floor(Date.now() / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
        const current: CandleData = {
          time: now,
          open: price, high: price, low: price, close: price,
          volume: 1,
        }
        seed.push(current)
        currentCandleRef.current = current
        setCandles(seed)
        setState(s => ({ ...s, loading: false }))
      }
    }, 50)

    // Stats poll
    const statsInterval = setInterval(() => {
      setState(s => ({
        ...s,
        ticksPerSecond: Math.round(sim.getTicksPerSecond()),
        fps: fpsRef.current.value,
      }))
    }, 1000)

    return () => {
      clearInterval(statsInterval)
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      sim.destroy()
      simRef.current = null
    }
  }, [enabled, pairCount, intervalMs, flushTicks, setCandles])

  return state
}
