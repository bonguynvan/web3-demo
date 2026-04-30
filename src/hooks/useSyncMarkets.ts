/**
 * useSyncMarkets — populates tradingStore.markets from the active venue.
 *
 * Mounted in AppShell. On mount and on every venue switch it calls
 * adapter.listMarkets() and pushes a UI-friendly slice into the store.
 * Components that read the dropdown list never need to touch the
 * adapter directly.
 */

import { useEffect } from 'react'
import { getActiveAdapter } from '../adapters/registry'
import { useActiveVenue } from './useActiveVenue'
import { useTradingStore } from '../store/tradingStore'

export function useSyncMarkets(): void {
  const venueId = useActiveVenue()
  const setMarkets = useTradingStore(s => s.setMarkets)

  useEffect(() => {
    let cancelled = false
    const adapter = getActiveAdapter()

    void (async () => {
      try {
        await adapter.connect()
        const markets = await adapter.listMarkets()
        if (cancelled) return
        setMarkets(markets.map(m => ({
          symbol: m.id,
          baseAsset: m.base,
        })))
      } catch {
        // Network/parse failure — leave the seed list in place so the
        // UI still renders. The user will see a short dropdown and can
        // switch venues.
      }
    })()

    return () => { cancelled = true }
  }, [venueId, setMarkets])
}
