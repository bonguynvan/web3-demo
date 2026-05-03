/**
 * useVenueFills — pull recent fills for an authed venue across N markets.
 *
 * Binance's `/api/v3/myTrades` is per-symbol, so the caller passes a
 * list of markets they care about (typically the markets where the user
 * has open orders or active positions). The hook fetches each in parallel,
 * merges, and sorts newest-first.
 *
 * Fetch on every change to the markets list and refresh every 60s.
 * Empty markets → no fetches.
 */

import { useEffect, useRef, useState } from 'react'
import { listAdapters } from '../adapters/registry'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { useToast } from '../store/toastStore'
import type { Fill, VenueId } from '../adapters/types'

export interface FillEntry {
  venueId: VenueId
  fill: Fill
}

export interface VenueFillsResult {
  entries: FillEntry[]
  loading: boolean
  fetchedAt: number | null
}

const POLL_MS = 60_000

interface AdapterWithFills {
  id: VenueId
  isAuthenticated?: () => boolean
  getRecentFills?: (marketId: string, limit?: number) => Promise<Fill[]>
}

export function useVenueFills(marketIds: string[], limit = 10): VenueFillsResult {
  const sessionUnlocked = useVaultSessionStore(s => s.unlocked)
  const toast = useToast()
  const key = marketIds.slice().sort().join(',')
  const [state, setState] = useState<VenueFillsResult>({ entries: [], loading: false, fetchedAt: null })
  // Track fill ids we've already seen so we only toast on genuinely new
  // ones. Reset when sessionUnlocked flips so a re-unlock doesn't re-toast.
  const seenRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!sessionUnlocked || marketIds.length === 0) {
      setState({ entries: [], loading: false, fetchedAt: null })
      seenRef.current = null
      return
    }
    let cancelled = false

    const fetchAll = async () => {
      setState(s => ({ ...s, loading: true }))
      const collected: FillEntry[] = []
      for (const adapter of listAdapters() as AdapterWithFills[]) {
        const isAuthed = typeof adapter.isAuthenticated === 'function' && adapter.isAuthenticated()
        if (!isAuthed) continue
        const fn = adapter.getRecentFills
        if (typeof fn !== 'function') continue
        await Promise.all(marketIds.map(async marketId => {
          try {
            const fills = await fn.call(adapter, marketId, limit)
            for (const f of fills) collected.push({ venueId: adapter.id, fill: f })
          } catch {
            // Silently drop per-market failures; the section degrades but
            // the rest of the page stays alive.
          }
        }))
      }
      if (cancelled) return
      collected.sort((a, b) => b.fill.timestamp - a.fill.timestamp)
      const final = collected.slice(0, 50)

      // Toast only on genuinely new fills. The first cycle just seeds the
      // seen set so we don't spam users with their entire history.
      if (seenRef.current === null) {
        seenRef.current = new Set(final.map(e => `${e.venueId}:${e.fill.id}`))
      } else {
        for (const e of final) {
          const key = `${e.venueId}:${e.fill.id}`
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key)
            toast.success(
              `${e.venueId} fill: ${e.fill.marketId} ${e.fill.side}`,
              `${e.fill.size} @ $${e.fill.price.toFixed(2)}`,
            )
          }
        }
      }

      setState({ entries: final, loading: false, fetchedAt: Date.now() })
    }

    fetchAll()
    const id = setInterval(fetchAll, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
    // key compresses marketIds into a stable string
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUnlocked, key, limit])

  return state
}
