/**
 * watchlistStore — user-pinned markets for quick access.
 *
 * Single global list (no per-address scoping) — watchlist preferences
 * are about the user's interests, not about which wallet is connected.
 * Persisted to localStorage at `tc-watchlist-v1`.
 */

import { create } from 'zustand'

const STORAGE_KEY = 'tc-watchlist-v1'
const MAX_ITEMS = 20

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

function save(symbols: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols))
  } catch { /* full */ }
}

interface WatchlistState {
  symbols: string[]
  has: (symbol: string) => boolean
  add: (symbol: string) => void
  remove: (symbol: string) => void
  toggle: (symbol: string) => void
  reorder: (from: number, to: number) => void
  clear: () => void
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  symbols: load(),

  has: (symbol) => get().symbols.includes(symbol),

  add: (symbol) => {
    const { symbols } = get()
    if (symbols.includes(symbol) || symbols.length >= MAX_ITEMS) return
    const next = [...symbols, symbol]
    set({ symbols: next })
    save(next)
  },

  remove: (symbol) => {
    const next = get().symbols.filter(s => s !== symbol)
    set({ symbols: next })
    save(next)
  },

  toggle: (symbol) => {
    const { symbols } = get()
    if (symbols.includes(symbol)) {
      get().remove(symbol)
    } else {
      get().add(symbol)
    }
  },

  reorder: (from, to) => {
    const { symbols } = get()
    if (from < 0 || from >= symbols.length || to < 0 || to >= symbols.length) return
    const next = [...symbols]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    set({ symbols: next })
    save(next)
  },

  clear: () => {
    set({ symbols: [] })
    save([])
  },
}))
