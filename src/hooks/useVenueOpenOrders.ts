/**
 * useVenueOpenOrders — pull authenticated open orders from connected venues.
 *
 * Mirrors `useVenueBalances` shape. Re-fetches every 30s while the vault
 * session is unlocked. Errors are surfaced via per-venue `error` field.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { listAdapters } from '../adapters/registry'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import type { Order, VenueId } from '../adapters/types'

export interface VenueOpenOrdersState {
  loading: boolean
  orders: Order[] | null
  error: string | null
  fetchedAt: number | null
}

export interface UseVenueOpenOrdersResult {
  states: Record<VenueId, VenueOpenOrdersState>
  refresh: () => void
}

const POLL_MS = 30_000

export function useVenueOpenOrders(): UseVenueOpenOrdersResult {
  const sessionUnlocked = useVaultSessionStore(s => s.unlocked)
  const [state, setState] = useState<Record<VenueId, VenueOpenOrdersState>>({} as Record<VenueId, VenueOpenOrdersState>)
  const fetchRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!sessionUnlocked) {
      setState({} as Record<VenueId, VenueOpenOrdersState>)
      fetchRef.current = null
      return
    }
    let cancelled = false

    const fetchAll = async () => {
      for (const adapter of listAdapters()) {
        const isAuthed = typeof (adapter as { isAuthenticated?: () => boolean }).isAuthenticated === 'function'
          && (adapter as { isAuthenticated: () => boolean }).isAuthenticated()
        if (!isAuthed) continue

        setState(prev => ({
          ...prev,
          [adapter.id]: { ...(prev[adapter.id] ?? {}), loading: true, error: null } as VenueOpenOrdersState,
        }))
        try {
          const orders = await adapter.getOpenOrders()
          if (cancelled) return
          setState(prev => ({
            ...prev,
            [adapter.id]: { loading: false, orders, error: null, fetchedAt: Date.now() },
          }))
        } catch (e) {
          if (cancelled) return
          const msg = e instanceof Error ? e.message : 'Unknown error'
          setState(prev => ({
            ...prev,
            [adapter.id]: { loading: false, orders: null, error: msg, fetchedAt: Date.now() },
          }))
        }
      }
    }

    fetchRef.current = fetchAll
    fetchAll()
    const id = setInterval(fetchAll, POLL_MS)
    return () => { cancelled = true; clearInterval(id); fetchRef.current = null }
  }, [sessionUnlocked])

  const refresh = useCallback(() => { void fetchRef.current?.() }, [])
  return { states: state, refresh }
}
