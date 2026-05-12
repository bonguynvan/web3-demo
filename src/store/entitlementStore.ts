/**
 * entitlementStore — Pro status snapshot for the logged-in user.
 *
 * Sourced from GET /api/me, refreshed via hooks/useEntitlement on
 * auth change + every ~60s while the app is open. Pure in-memory —
 * the source of truth is the backend.
 */

import { create } from 'zustand'
import type { Me } from '../api/auth'

interface EntitlementState {
  data: Me | null
  loading: boolean
  error: string | null
  set: (data: Me) => void
  clear: () => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
}

export const useEntitlementStore = create<EntitlementState>(set => ({
  data: null,
  loading: false,
  error: null,
  set: data => set({ data, error: null, loading: false }),
  clear: () => set({ data: null, error: null, loading: false }),
  setLoading: v => set({ loading: v }),
  setError: e => set({ error: e, loading: false }),
}))
