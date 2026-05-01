/**
 * signalSettingsStore — per-user toggles for which signal sources fire.
 *
 * Stored in localStorage. useSignals reads the enabled flags and
 * filters the final feed; the underlying compute layer is unchanged
 * (confluence still has access to every signal internally — we just
 * hide the user-disabled ones from the panel/alerts/bots).
 */

import { create } from 'zustand'
import type { SignalSource } from '../signals/types'

const STORAGE_KEY = 'tc-signal-settings-v1'

const ALL_SOURCES: SignalSource[] = [
  'funding', 'crossover', 'rsi', 'volatility',
  'liquidation', 'news', 'whale', 'confluence',
]

export type SourceFlags = Record<SignalSource, boolean>

const DEFAULTS: SourceFlags = {
  funding: true,
  crossover: true,
  rsi: true,
  volatility: true,
  liquidation: true,
  news: true,
  whale: true,
  confluence: true,
}

interface PersistedShape {
  enabled: SourceFlags
}

function load(): SourceFlags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<PersistedShape>
    const merged: SourceFlags = { ...DEFAULTS }
    if (parsed.enabled) {
      for (const src of ALL_SOURCES) {
        if (typeof parsed.enabled[src] === 'boolean') {
          merged[src] = parsed.enabled[src] as boolean
        }
      }
    }
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(enabled: SourceFlags): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled })) } catch { /* full */ }
}

interface SignalSettingsStore {
  enabled: SourceFlags
  toggle: (source: SignalSource) => void
  setAll: (val: boolean) => void
}

export const useSignalSettingsStore = create<SignalSettingsStore>((set) => ({
  enabled: load(),

  toggle: (source) => set(state => {
    const next: SourceFlags = { ...state.enabled, [source]: !state.enabled[source] }
    persist(next)
    return { enabled: next }
  }),

  setAll: (val) => set(() => {
    const next: SourceFlags = { ...DEFAULTS }
    for (const src of ALL_SOURCES) next[src] = val
    persist(next)
    return { enabled: next }
  }),
}))

export { ALL_SOURCES }
