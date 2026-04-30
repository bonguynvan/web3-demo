/**
 * useTopMarketsCandles — fetches klines for the top-N markets.
 *
 * Powers cross-market TA scanning: useSignals iterates the returned
 * map and runs crossover + volatility per market so the Signals tab
 * surfaces opportunities outside whatever the user is currently
 * charting.
 *
 * Pacing: top markets are fetched sequentially with a 100ms gap. At
 * default (10 markets) that's ~1s total per refresh, refreshing every
 * 60s — comfortably below any rate limit. Increase the limit only if
 * you also raise the refresh interval.
 */

import { useEffect, useState } from 'react'
import { getActiveAdapter } from '../adapters/registry'
import { useActiveVenue } from './useActiveVenue'
import { useTradingStore } from '../store/tradingStore'
import type { CandleData } from '../types/trading'
import type { TimeFrame } from '../adapters/types'

const REFRESH_MS = 60_000
const KLINE_LIMIT = 100              // enough for slow EMA + cushion
const PACE_MS = 100                  // gap between per-market requests

interface Options {
  limit?: number
  timeframe?: TimeFrame
}

export function useTopMarketsCandles({
  limit = 10,
  timeframe = '5m',
}: Options = {}): Map<string, CandleData[]> {
  const venueId = useActiveVenue()
  const markets = useTradingStore(s => s.markets)
  const [candleMap, setCandleMap] = useState<Map<string, CandleData[]>>(new Map())

  useEffect(() => {
    let cancelled = false
    const adapter = getActiveAdapter()

    const fetchAll = async () => {
      const targets = markets.slice(0, limit)
      const next = new Map<string, CandleData[]>()
      for (const m of targets) {
        if (cancelled) return
        try {
          const candles = await adapter.getKlines(m.symbol, timeframe, { limit: KLINE_LIMIT })
          // Adapter Candle and store CandleData share the same numeric
          // shape (time/open/high/low/close/volume).
          next.set(m.symbol, candles)
        } catch {
          // Skip on error — venue throttle, network blip, etc.
        }
        await new Promise(r => setTimeout(r, PACE_MS))
      }
      if (!cancelled) setCandleMap(next)
    }

    void fetchAll()
    const id = setInterval(fetchAll, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [venueId, limit, timeframe, markets])

  return candleMap
}
