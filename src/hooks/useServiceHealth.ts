/**
 * useServiceHealth — surfaces the "is the stack up?" state to the UI.
 *
 * Three inputs:
 *   - Backend REST:   polls apiClient.health() every HEALTH_POLL_MS
 *   - Backend WS:     subscribes to wsClient.onStateChange() (push-based)
 *   - Wallet chain:   from wagmi useChainId() — compared against expected
 *                     network to flag "wrong chain" in live mode
 *
 * Outputs an `overall` status the header + banner can read directly:
 *   - 'up'       — everything the current mode needs is healthy
 *   - 'degraded' — secondary component is flaky (e.g. WS flapping but REST ok)
 *   - 'down'     — a component the current mode DEPENDS ON is unreachable
 *
 * Demo mode has no backend dependency, so overall is always 'up' unless the
 * chain is misconfigured (which only matters to live-mode flows anyway).
 */

import { useEffect, useState, useMemo } from 'react'
import { useChainId } from 'wagmi'
import { apiClient } from '../lib/apiClient'
import { wsClient, type WsConnectionState } from '../lib/wsClient'
import { useIsDemo } from '../store/modeStore'

const HEALTH_POLL_MS = 10_000
const EXPECTED_CHAIN_ID = 31337 // Anvil / local foundry

export type BackendStatus = 'unknown' | 'up' | 'down'
export type OverallStatus = 'up' | 'degraded' | 'down'

export interface ServiceHealth {
  /** Backend REST reachability. Tracks the last successful poll. */
  backend: BackendStatus
  /** WebSocket connection state from the singleton. */
  websocket: WsConnectionState
  /** Current wagmi chain id (0 if wallet not connected). */
  chainId: number
  /** True when on the chain the app expects (matters only for live mode). */
  chainOk: boolean
  /** Timestamp (ms) of the last backend health check response or failure. */
  lastCheckedAt: number | null
  /**
   * Rolling overall status that the header pill + banner can read:
   *  - demo  → 'up' unless a bug surfaces
   *  - live  → 'down' if backend unreachable, 'degraded' if WS flapping or
   *             wrong chain, 'up' otherwise
   */
  overall: OverallStatus
}

export function useServiceHealth(): ServiceHealth {
  const isDemo = useIsDemo()
  const chainId = useChainId()

  const [backend, setBackend] = useState<BackendStatus>('unknown')
  const [websocket, setWebsocket] = useState<WsConnectionState>(() =>
    wsClient.getConnectionState(),
  )
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)

  // ─── WebSocket state observer ────────────────────────────────────────────
  // Push-based — no polling. The wsClient replays the current state on
  // subscribe so there's no initial-value gap.
  useEffect(() => {
    const unsub = wsClient.onStateChange(setWebsocket)
    return unsub
  }, [])

  // ─── Backend REST poller ────────────────────────────────────────────────
  // Always running — even in demo mode we'd like to know when the backend
  // comes back up so the status pill reflects reality. Cheap: one GET per 10s.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = async () => {
      if (cancelled) return
      try {
        const ok = await apiClient.health()
        if (cancelled) return
        setBackend(ok ? 'up' : 'down')
      } catch {
        if (cancelled) return
        setBackend('down')
      }
      if (!cancelled) {
        setLastCheckedAt(Date.now())
        timer = setTimeout(check, HEALTH_POLL_MS)
      }
    }

    check()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  // ─── Derived overall status ────────────────────────────────────────────
  return useMemo(() => {
    const chainOk = chainId === EXPECTED_CHAIN_ID

    // Demo mode doesn't depend on backend or WS, so the only thing that can
    // make it unhealthy is the rest of the app choking — report 'up' unless
    // the wallet is on the wrong chain, in which case flag 'degraded' as
    // a nudge that live mode won't work.
    if (isDemo) {
      const overall: OverallStatus = chainOk || chainId === 0 ? 'up' : 'degraded'
      return { backend, websocket, chainId, chainOk, lastCheckedAt, overall }
    }

    // Live mode depends on backend REST (for markets/stats) and the chain
    // being correct (for read contracts + sim + write). WS is secondary —
    // we can still render trades + stats from REST if WS is flapping.
    let overall: OverallStatus = 'up'

    if (backend === 'down') {
      overall = 'down'
    } else if (!chainOk && chainId !== 0) {
      overall = 'down'
    } else if (websocket === 'disconnected' || backend === 'unknown') {
      overall = 'degraded'
    }

    return { backend, websocket, chainId, chainOk, lastCheckedAt, overall }
  }, [isDemo, backend, websocket, chainId, lastCheckedAt])
}
