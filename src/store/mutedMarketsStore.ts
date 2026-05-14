/**
 * mutedMarketsStore — per-market silence list for the SignalsPanel.
 *
 * Why: a few markets (low-liquidity meme coins, or whatever the user
 * doesn't care about) generate disproportionate signal noise. Letting
 * the user one-click mute a market collapses that noise without
 * affecting the actual signal compute pipeline.
 *
 * Persisted to localStorage so a reload preserves the silence list.
 */

import { create } from 'zustand'

const KEY = 'tc-muted-markets-v1'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? new Set(arr.filter(x => typeof x === 'string') as string[]) : new Set()
  } catch { return new Set() }
}

function persist(s: Set<string>): void {
  try { localStorage.setItem(KEY, JSON.stringify(Array.from(s))) } catch { /* full */ }
}

interface MutedMarketsState {
  muted: Set<string>
  isMuted: (marketId: string) => boolean
  mute: (marketId: string) => void
  unmute: (marketId: string) => void
  clear: () => void
}

export const useMutedMarketsStore = create<MutedMarketsState>((set, get) => ({
  muted: load(),
  isMuted: (id) => get().muted.has(id),
  mute: (id) => {
    const next = new Set(get().muted)
    next.add(id)
    persist(next)
    set({ muted: next })
  },
  unmute: (id) => {
    const next = new Set(get().muted)
    next.delete(id)
    persist(next)
    set({ muted: next })
  },
  clear: () => {
    persist(new Set())
    set({ muted: new Set() })
  },
}))
