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

import { useCallback, useEffect, useRef, useState } from 'react'
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

interface RawHlSummary { accountValue?: string | number; totalMarginUsed?: string | number }
interface RawHlSnapshot { marginSummary?: RawHlSummary; withdrawable?: string | number }

function parseHyperliquid(snap: unknown): VenueBalance[] {
  if (!snap || typeof snap !== 'object') return []
  const s = snap as RawHlSnapshot
  const equity = Number(s.marginSummary?.accountValue ?? 0)
  const used = Number(s.marginSummary?.totalMarginUsed ?? 0)
  const withdrawable = Number(s.withdrawable ?? Math.max(0, equity - used))
  if (equity <= 0 && withdrawable <= 0) return []
  return [{
    asset: 'USDC',
    free: withdrawable,
    locked: Math.max(0, equity - withdrawable),
  }]
}

export interface UseVenueBalancesResult {
  states: Record<VenueId, VenueBalanceState>
  /** Trigger an immediate fetch of all authed venues. */
  refresh: () => void
}

export function useVenueBalances(): UseVenueBalancesResult {
  const sessionUnlocked = useVaultSessionStore(s => s.unlocked)
  const [state, setState] = useState<Record<VenueId, VenueBalanceState>>({} as Record<VenueId, VenueBalanceState>)
  const fetchRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!sessionUnlocked) {
      setState({} as Record<VenueId, VenueBalanceState>)
      fetchRef.current = null
      return
    }
    let cancelled = false

    const fetchAll = async () => {
      for (const adapter of listAdapters()) {
        const isAuthed = typeof (adapter as unknown as { isAuthenticated?: () => boolean }).isAuthenticated === 'function'
          && (adapter as unknown as { isAuthenticated: () => boolean }).isAuthenticated()
        if (!isAuthed) continue
        const hasSnap = typeof (adapter as unknown as { getAccountSnapshot?: () => Promise<unknown> }).getAccountSnapshot === 'function'
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
          const raw = await (adapter as unknown as { getAccountSnapshot: () => Promise<unknown> }).getAccountSnapshot()
          if (cancelled) return
          // Normalise per-venue. Adding a new authed venue means adding
          // its parser here.
          const balances = adapter.id === 'binance'
            ? parseBinance(raw)
            : adapter.id === 'hyperliquid'
              ? parseHyperliquid(raw)
              : []
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

    fetchRef.current = fetchAll
    fetchAll()
    const id = setInterval(fetchAll, POLL_MS)
    return () => { cancelled = true; clearInterval(id); fetchRef.current = null }
  }, [sessionUnlocked])

  const refresh = useCallback(() => { void fetchRef.current?.() }, [])

  return { states: state, refresh }
}
