/**
 * useSignals — live signal feed derived from venue state.
 *
 * Architecture:
 *   - `useSignalsRoot()` does the actual compute. Mount ONCE at the
 *     app root (AppShell). Runs every 5s, writes to `signalsStore`.
 *   - `useSignals()` is a selector — every consumer just reads the
 *     latest snapshot. Cheap, no recomputation.
 *
 * Before this split, the 5s compute ran 4× per tick because four
 * different hooks each called the original `useSignals()` and each
 * had its own internal heartbeat. Lifting to a shared store removes
 * the redundancy without changing any caller's API.
 */

import { useEffect, useState } from 'react'
import { getActiveAdapter } from '../adapters/registry'
import { useActiveVenue } from './useActiveVenue'
import { useLargeTrades } from './useLargeTrades'
import { useTopMarketsCandles } from './useTopMarketsCandles'
import { useNewsSignals } from './useNewsSignals'
import { useOnchainWhaleSignals } from './useOnchainWhaleSignals'
import { useTradingStore } from '../store/tradingStore'
import { useSignalSettingsStore } from '../store/signalSettingsStore'
import { useSignalThresholdsStore } from '../store/signalThresholdsStore'
import { useSignalsStore } from '../store/signalsStore'
import { computeSignals, applyThresholds } from '../signals/compute'
import { isLive, type Signal } from '../signals/types'
import type { Market, Ticker } from '../adapters/types'

const RECOMPUTE_MS = 5_000

/** Mount once at the app root — pushes signals into the shared store. */
export function useSignalsRoot(): void {
  const venueId = useActiveVenue()
  const markets = useTradingStore(s => s.markets)
  const candles = useTradingStore(s => s.candles)
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const largeTrades = useLargeTrades()
  const candlesByMarket = useTopMarketsCandles({ limit: 10, timeframe: '5m' })
  const newsSignals = useNewsSignals()
  const onchainWhaleSignals = useOnchainWhaleSignals()
  const enabledSources = useSignalSettingsStore(s => s.enabled)
  const thresholds = useSignalThresholdsStore(s => s.thresholds)
  const setSignals = useSignalsStore(s => s.setSignals)
  const [tick, setTick] = useState(0)

  useEffect(() => { applyThresholds(thresholds) }, [thresholds])

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), RECOMPUTE_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const adapter = getActiveAdapter()
    const tickers = new Map<string, Ticker>()
    const adapterMarkets: Market[] = []
    for (const m of markets) {
      const venueMarket = adapter.getMarket(m.symbol)
      if (!venueMarket) continue
      adapterMarkets.push(venueMarket)
      const t = adapter.getTicker(m.symbol)
      if (t) tickers.set(m.symbol, t)
    }

    const now = Date.now()
    const computed = computeSignals({
      venue: venueId,
      markets: adapterMarkets,
      tickers,
      selectedMarketId: selectedMarket.symbol,
      candles,
      candlesByMarket,
      largeTrades,
    }, now)

    const merged = [...computed, ...newsSignals, ...onchainWhaleSignals]
    merged.sort((a, b) => b.confidence - a.confidence)
    const filtered = merged.filter(s => enabledSources[s.source] !== false && isLive(s, now))
    setSignals(filtered)
    // tick drives heartbeat re-eval
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, markets, candles, candlesByMarket, selectedMarket.symbol, largeTrades, newsSignals, onchainWhaleSignals, enabledSources, tick, setSignals])
}

/** Read the latest signals snapshot. Cheap; just a store selector. */
export function useSignals(): Signal[] {
  return useSignalsStore(s => s.signals)
}
