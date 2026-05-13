/**
 * useEntitlement — keeps useEntitlementStore in sync with /api/me.
 *
 * Mounted once in AppShell. Refetches on auth change and on a 60s
 * timer while the token is valid. On 401 the auth store is cleared so
 * the SignIn button reappears.
 *
 * Returns nothing — components read from useEntitlementStore + the
 * deriveProState() helper in lib/pro.ts.
 */

import { useEffect } from 'react'
import { ApiError, apiAvailable } from '../api/client'
import { fetchMe } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import { useEntitlementStore } from '../store/entitlementStore'

const POLL_MS = 60_000

export function useEntitlement(): void {
  const token = useAuthStore(s => s.token)
  const signOut = useAuthStore(s => s.signOut)
  const setEnt = useEntitlementStore(s => s.set)
  const clearEnt = useEntitlementStore(s => s.clear)
  const setError = useEntitlementStore(s => s.setError)
  const setLoading = useEntitlementStore(s => s.setLoading)

  useEffect(() => {
    if (!apiAvailable() || !token) {
      clearEnt()
      return
    }
    const controller = new AbortController()
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const me = await fetchMe(controller.signal)
        if (!cancelled) setEnt(me)
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        if (err instanceof ApiError && err.status === 401) {
          // Token expired or revoked — drop session, button reappears.
          signOut()
          clearEnt()
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    void run()
    const t = setInterval(() => { void run() }, POLL_MS)
    return () => {
      cancelled = true
      controller.abort()
      clearInterval(t)
    }
  }, [token, setEnt, clearEnt, setError, setLoading, signOut])
}
