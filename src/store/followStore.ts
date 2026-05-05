/**
 * followStore — user's followed authors and strategy ids.
 *
 * Drives the "Following" tab in the marketplace and the follow toggle
 * on each strategy card. Pure client-side: no server, no auth, just a
 * persistent list of identifiers.
 */

import { create } from 'zustand'

const STORAGE_KEY = 'tc-following-v1'

interface State {
  authors: string[]
  strategies: string[]
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { authors: [], strategies: [] }
    const parsed = JSON.parse(raw)
    return {
      authors: Array.isArray(parsed.authors) ? parsed.authors.filter((a: unknown): a is string => typeof a === 'string') : [],
      strategies: Array.isArray(parsed.strategies) ? parsed.strategies.filter((s: unknown): s is string => typeof s === 'string') : [],
    }
  } catch { return { authors: [], strategies: [] } }
}

function save(s: State) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* full */ }
}

interface FollowStore extends State {
  followsAuthor: (handle: string) => boolean
  followsStrategy: (id: string) => boolean
  toggleAuthor: (handle: string) => void
  toggleStrategy: (id: string) => void
  clear: () => void
}

export const useFollowStore = create<FollowStore>((set, get) => ({
  ...load(),

  followsAuthor: (handle) => get().authors.includes(handle),
  followsStrategy: (id) => get().strategies.includes(id),

  toggleAuthor: (handle) => {
    const { authors, strategies } = get()
    const next = authors.includes(handle)
      ? authors.filter(a => a !== handle)
      : [...authors, handle]
    set({ authors: next })
    save({ authors: next, strategies })
  },

  toggleStrategy: (id) => {
    const { authors, strategies } = get()
    const next = strategies.includes(id)
      ? strategies.filter(s => s !== id)
      : [...strategies, id]
    set({ strategies: next })
    save({ authors, strategies: next })
  },

  clear: () => {
    set({ authors: [], strategies: [] })
    save({ authors: [], strategies: [] })
  },
}))
