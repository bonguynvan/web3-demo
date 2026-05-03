/**
 * useVenueBalances — pull authenticated balances from connected venues.
 *
 * Today only Binance is wired — the adapter's `getAccountSnapshot()`
 * makes a signed `/api/v3/account` call. Other adapters that don't yet
 * implement an account endpoint return null for that venue.
 *
 * Re-fetches every 30s while the vault session is unlocked. Errors do
 * not throw — they're surfaced via the per-venue `error` field so the
 * UI can render a degraded state rather than crash.
 */

import { useEffect, useState } from 'react'
import { listAdapters } from '../adapters/registry'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import type { VenueId } from '../adapters/types'

export interface VenueBalance {
  asset: string
  free: number
  locked: number
}

export interface VenueBalanceState {
  loading: boolean
  balances: VenueBalance[] | null
  error: string | null
  fetchedAt: number | null
}

const POLL_MS = 30_000

interface RawBinanceBalance { asset?: string; free?: string | number; locked?: string | number }
interface RawBinanceSnapshot { balances?: RawBinanceBalance[] }

function parseBinance(snap: unknown): VenueBalance[] {
  if (!snap || typeof snap !== 'object') return []
  const s = snap as RawBinanceSnapshot
  if (!Array.isArray(s.balances)) return []
  return s.balances
    .map<VenueBalance>(b => ({
      asset: typeof b.asset === 'string' ? b.asset : '',
      free: Number(b.free ?? 0),
      locked: Number(b.locked ?? 0),
    }))
    .filter(b => b.asset && (b.free > 0 || b.locked > 0))
    .sort((a, b) => (b.free + b.locked) - (a.free + a.locked))
}

export function useVenueBalances(): Record<VenueId, VenueBalanceState> {
  const sessionUnlocked = useVaultSessionStore(s => s.unlocked)
  const [state, setState] = useState<Record<VenueId, VenueBalanceState>>({} as Record<VenueId, VenueBalanceState>)

  useEffect(() => {
    if (!sessionUnlocked) {
      setState({} as Record<VenueId, VenueBalanceState>)
      return
    }
    let cancelled = false

    const fetchAll = async () => {
      for (const adapter of listAdapters()) {
        const isAuthed = typeof (adapter as { isAuthenticated?: () => boolean }).isAuthenticated === 'function'
          && (adapter as { isAuthenticated: () => boolean }).isAuthenticated()
        if (!isAuthed) continue
        const hasSnap = typeof (adapter as { getAccountSnapshot?: () => Promise<unknown> }).getAccountSnapshot === 'function'
        if (!hasSnap) {
          setState(prev => ({
            ...prev,
            [adapter.id]: { loading: false, balances: null, error: 'no snapshot endpoint', fetchedAt: null },
          }))
          continue
        }

        setState(prev => ({
          ...prev,
          [adapter.id]: { ...(prev[adapter.id] ?? {}), loading: true, error: null } as VenueBalanceState,
        }))
        try {
          const raw = await (adapter as { getAccountSnapshot: () => Promise<unknown> }).getAccountSnapshot()
          if (cancelled) return
          // Normalise per-venue. Adding a new authed venue means adding
          // its parser here.
          const balances = adapter.id === 'binance' ? parseBinance(raw) : []
          setState(prev => ({
            ...prev,
            [adapter.id]: { loading: false, balances, error: null, fetchedAt: Date.now() },
          }))
        } catch (e) {
          if (cancelled) return
          const msg = e instanceof Error ? e.message : 'Unknown error'
          setState(prev => ({
            ...prev,
            [adapter.id]: { loading: false, balances: null, error: msg, fetchedAt: Date.now() },
          }))
        }
      }
    }

    fetchAll()
    const id = setInterval(fetchAll, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [sessionUnlocked])

  return state
}
