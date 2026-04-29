/**
 * Venue registry — single source of truth for which adapter is active.
 *
 * Hooks and components call getActiveAdapter() instead of importing a
 * specific adapter, so the active venue can be swapped at runtime
 * (settings page, demo toggle, fallback) without touching consumers.
 *
 * Registration is eager at module load. Adding a venue is one line in
 * register() below.
 */

import { BinanceAdapter } from './binance/BinanceAdapter'
import type { VenueAdapter } from './VenueAdapter'
import type { VenueId } from './types'

const adapters = new Map<VenueId, VenueAdapter>()
const listeners = new Set<(id: VenueId) => void>()

let activeId: VenueId

function register(adapter: VenueAdapter): void {
  adapters.set(adapter.id, adapter)
}

register(new BinanceAdapter())
activeId = 'binance'

export function getActiveAdapter(): VenueAdapter {
  const adapter = adapters.get(activeId)
  if (!adapter) {
    throw new Error(`No adapter registered for active venue "${activeId}"`)
  }
  return adapter
}

export function getAdapter(id: VenueId): VenueAdapter | undefined {
  return adapters.get(id)
}

export function listAdapters(): VenueAdapter[] {
  return Array.from(adapters.values())
}

export function getActiveVenueId(): VenueId {
  return activeId
}

/**
 * Switch the active venue. Notifies subscribers so hooks can resubscribe
 * their streams. Throws if the venue isn't registered.
 */
export function setActiveVenue(id: VenueId): void {
  if (!adapters.has(id)) {
    throw new Error(`Cannot activate unregistered venue "${id}"`)
  }
  if (id === activeId) return
  activeId = id
  for (const cb of listeners) {
    try { cb(id) } catch { /* ignore listener errors */ }
  }
}

export function subscribeActiveVenue(cb: (id: VenueId) => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
