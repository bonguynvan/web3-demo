/**
 * signalsStore — single source of truth for the live signal feed.
 *
 * Before this store, `useSignals()` was called from 4 different hooks
 * (AppShell tracker, alerts, Telegram, bot engine), each running its
 * own 5s heartbeat + compute. That's 4× redundant work per tick.
 *
 * Now: `useSignalsRoot()` runs ONCE in AppShell, computes signals on
 * the heartbeat, and writes them here. Everything else reads via the
 * `useSignals()` selector — no recomputation.
 */

import { create } from 'zustand'
import type { Signal } from '../signals/types'

interface SignalsStore {
  signals: Signal[]
  setSignals: (s: Signal[]) => void
}

export const useSignalsStore = create<SignalsStore>((set) => ({
  signals: [],
  setSignals: (s) => set({ signals: s }),
}))
