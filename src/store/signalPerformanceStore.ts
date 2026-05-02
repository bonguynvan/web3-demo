/**
 * signalPerformanceStore — track each source's hit rate over time.
 *
 * When a signal fires, we record entry price. After RESOLVE_AFTER_MS
 * elapses, the tracker hook calls resolvePending() with a price-getter;
 * resolved entries become hit/miss based on whether the move went the
 * predicted direction. Per-source aggregates feed the UI.
 */

import { create } from 'zustand'
import type { Signal, SignalDirection, SignalSource } from '../signals/types'

const STORAGE_KEY = 'tc-signal-performance-v1'
export const RESOLVE_AFTER_MS = 30 * 60_000
const MAX_RESOLVED = 200
// Defensive cap. Normal flow keeps pending well under 100; this guards
// against a bug or stalled resolver where entries accumulate forever.
const MAX_PENDING = 500

export interface PendingEntry {
  id: string
  source: SignalSource
  marketId: string
  direction: SignalDirection
  entryPrice: number
  triggeredAt: number
  resolveAt: number
}

export interface ResolvedEntry extends PendingEntry {
  closePrice: number
  closedAt: number
  hit: boolean
}

export interface SourceStats {
  source: SignalSource
  total: number
  hits: number
  hitRate: number
}

interface PerformanceState {
  pending: PendingEntry[]
  resolved: ResolvedEntry[]
}

function load(): PerformanceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { pending: [], resolved: [] }
    const parsed = JSON.parse(raw) as Partial<PerformanceState>
    return {
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
      resolved: Array.isArray(parsed.resolved) ? parsed.resolved : [],
    }
  } catch {
    return { pending: [], resolved: [] }
  }
}

function persist(state: PerformanceState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* full */ }
}

interface PerformanceStore extends PerformanceState {
  recordSignal: (s: Signal, entryPrice: number) => void
  resolvePending: (now: number, getPrice: (marketId: string) => number | undefined) => void
  getStats: () => SourceStats[]
  clear: () => void
}

export const useSignalPerformanceStore = create<PerformanceStore>((set, get) => ({
  ...load(),
  recordSignal: (s, entryPrice) => set(state => {
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) return state
    if (state.pending.some(p => p.id === s.id)) return state
    if (state.resolved.some(r => r.id === s.id)) return state
    const entry: PendingEntry = {
      id: s.id,
      source: s.source,
      marketId: s.marketId,
      direction: s.direction,
      entryPrice,
      triggeredAt: s.triggeredAt,
      resolveAt: s.triggeredAt + RESOLVE_AFTER_MS,
    }
    const merged = [...state.pending, entry]
    const trimmed = merged.length > MAX_PENDING
      ? merged.slice(merged.length - MAX_PENDING)
      : merged
    const next = { ...state, pending: trimmed }
    persist(next)
    return next
  }),
  resolvePending: (now, getPrice) => set(state => {
    const stillPending: PendingEntry[] = []
    const newlyResolved: ResolvedEntry[] = []
    for (const p of state.pending) {
      if (p.resolveAt > now) {
        stillPending.push(p)
        continue
      }
      const closePrice = getPrice(p.marketId)
      if (closePrice == null || !Number.isFinite(closePrice) || closePrice <= 0) {
        // No price yet — keep pending up to 1 hour grace, then drop.
        if (now - p.resolveAt < 60 * 60_000) stillPending.push(p)
        continue
      }
      const moved = (closePrice - p.entryPrice) / p.entryPrice
      const hit = p.direction === 'long' ? moved > 0 : moved < 0
      newlyResolved.push({ ...p, closePrice, closedAt: now, hit })
    }
    if (newlyResolved.length === 0 && stillPending.length === state.pending.length) {
      return state
    }
    const merged = [...state.resolved, ...newlyResolved]
    const trimmed = merged.length > MAX_RESOLVED
      ? merged.slice(merged.length - MAX_RESOLVED)
      : merged
    const next = { pending: stillPending, resolved: trimmed }
    persist(next)
    return next
  }),
  getStats: () => {
    const { resolved } = get()
    const buckets = new Map<SignalSource, { total: number; hits: number }>()
    for (const r of resolved) {
      const b = buckets.get(r.source) ?? { total: 0, hits: 0 }
      b.total += 1
      if (r.hit) b.hits += 1
      buckets.set(r.source, b)
    }
    const out: SourceStats[] = []
    for (const [source, { total, hits }] of buckets) {
      out.push({ source, total, hits, hitRate: total > 0 ? hits / total : 0 })
    }
    return out
  },
  clear: () => set(() => {
    const empty: PerformanceState = { pending: [], resolved: [] }
    persist(empty)
    return empty
  }),
}))
