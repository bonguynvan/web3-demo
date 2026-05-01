/**
 * signalThresholdsStore — user overrides for signal-source thresholds.
 *
 * Compute functions in src/signals/compute.ts hold their thresholds as
 * mutable module-level lets exposed via applyThresholds(). This store
 * persists user choices and the useSignals hook calls applyThresholds
 * whenever the store changes so compute reads the latest values.
 */

import { create } from 'zustand'

const STORAGE_KEY = 'tc-signal-thresholds-v1'

export interface SignalThresholds {
  rsiOverbought: number       // 50..100, default 70
  rsiOversold: number         // 0..50, default 30
  volatilityMultiple: number  // 1.5..6, default 3
  whaleMinSkew: number        // 0..1, default 0.6
}

export const DEFAULT_THRESHOLDS: SignalThresholds = {
  rsiOverbought: 70,
  rsiOversold: 30,
  volatilityMultiple: 3,
  whaleMinSkew: 0.6,
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, v))
}

function load(): SignalThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_THRESHOLDS }
    const parsed = JSON.parse(raw) as Partial<SignalThresholds>
    return {
      rsiOverbought: clamp(parsed.rsiOverbought, 50, 100, DEFAULT_THRESHOLDS.rsiOverbought),
      rsiOversold: clamp(parsed.rsiOversold, 0, 50, DEFAULT_THRESHOLDS.rsiOversold),
      volatilityMultiple: clamp(parsed.volatilityMultiple, 1.5, 6, DEFAULT_THRESHOLDS.volatilityMultiple),
      whaleMinSkew: clamp(parsed.whaleMinSkew, 0, 1, DEFAULT_THRESHOLDS.whaleMinSkew),
    }
  } catch {
    return { ...DEFAULT_THRESHOLDS }
  }
}

function persist(t: SignalThresholds): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)) } catch { /* full */ }
}

interface SignalThresholdsStore {
  thresholds: SignalThresholds
  set: <K extends keyof SignalThresholds>(key: K, value: SignalThresholds[K]) => void
  reset: () => void
}

export const useSignalThresholdsStore = create<SignalThresholdsStore>((set) => ({
  thresholds: load(),
  set: (key, value) => set(state => {
    const next: SignalThresholds = { ...state.thresholds, [key]: value }
    persist(next)
    return { thresholds: next }
  }),
  reset: () => set(() => {
    persist(DEFAULT_THRESHOLDS)
    return { thresholds: { ...DEFAULT_THRESHOLDS } }
  }),
}))
