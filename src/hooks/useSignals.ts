/**
 * useSignals — live signal feed derived from venue state.
 *
 * Composes the pure compute layer with the existing React state:
 *   - venue from useActiveVenue
 *   - markets from tradingStore
 *   - candles for the selected market from tradingStore
 *   - tickers (with funding rates) from the active adapter
 *
 * Re-evaluates every 5s so funding-rate updates pushed via the venue
 * WS — which don't necessarily trigger React renders — still show up
 * as fresh signals.
 */

import { useEffect, useMemo, useState } from 'react'
import { getActiveAdapter } from '../adapters/registry'
import { useActiveVenue } from './useActiveVenue'
import { useLargeTrades } from './useLargeTrades'
import { useTopMarketsCandles } from './useTopMarketsCandles'
import { useNewsSignals } from './useNewsSignals'
import { useOnchainWhaleSignals } from './useOnchainWhaleSignals'
import { useTradingStore } from '../store/tradingStore'
import { useSignalSettingsStore } from '../store/signalSettingsStore'
import { useSignalThresholdsStore } from '../store/signalThresholdsStore'
import { computeSignals, applyThresholds } from '../signals/compute'
import { isLive, type Signal } from '../signals/types'
import type { Market, Ticker } from '../adapters/types'

const RECOMPUTE_MS = 5_000

export function useSignals(): Signal[] {
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
  const [tick, setTick] = useState(0)

  // Push user-tuned thresholds into the compute module on every change.
  useEffect(() => {
    applyThresholds(thresholds)
  }, [thresholds])

  // Heartbeat — pulls fresh tickers from the adapter cache without
  // forcing every component subscribed to a single ticker to re-render.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), RECOMPUTE_MS)
    return () => clearInterval(id)
  }, [])

  return useMemo(() => {
    const adapter = getActiveAdapter()
    // Build a Map<marketId, Ticker> from the adapter cache. Markets
    // without a cached ticker (e.g. just-switched venue, no tick yet)
    // simply don't contribute funding signals this cycle.
    const storeMarkets = markets
    const tickers = new Map<string, Ticker>()
    const adapterMarkets: Market[] = []
    for (const m of storeMarkets) {
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

    // News + on-chain whale signals come from different code paths
    // (event-driven, not candle-derived). Merge them in and re-sort
    // once by confidence so the final feed is consistent.
    const merged = [...computed, ...newsSignals, ...onchainWhaleSignals]
    merged.sort((a, b) => b.confidence - a.confidence)
    // Filter by user-toggled source flags as the very last step so the
    // underlying compute (including confluence) sees the full signal
    // set internally. This is purely a presentation preference.
    return merged.filter(s => enabledSources[s.source] !== false && isLive(s, now))
    // tick is intentionally a dep — drives re-eval on the heartbeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, markets, candles, candlesByMarket, selectedMarket.symbol, largeTrades, newsSignals, onchainWhaleSignals, enabledSources, tick])
}
