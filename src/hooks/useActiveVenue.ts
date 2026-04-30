/**
 * useActiveVenue — React-friendly read of the active venue id.
 *
 * Subscribes to the adapter registry so consumers re-render when the
 * user switches venues (Binance ↔ Hyperliquid ↔ ...). Other data hooks
 * include the returned id in their effect deps to re-subscribe streams.
 */

import { useEffect, useState } from 'react'
import {
  getActiveVenueId,
  subscribeActiveVenue,
} from '../adapters/registry'
import type { VenueId } from '../adapters/types'

export function useActiveVenue(): VenueId {
  const [id, setId] = useState<VenueId>(() => getActiveVenueId())

  useEffect(() => {
    // Re-sync once on mount in case the venue changed between
    // useState init and effect commit.
    setId(getActiveVenueId())
    return subscribeActiveVenue(setId)
  }, [])

  return id
}
