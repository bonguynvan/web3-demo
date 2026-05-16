/**
 * journalStore — per-trade annotations + tags + self-grade.
 *
 * Pros review every closed trade weekly: what went right, what went
 * wrong, recurring patterns. This store holds those notes keyed by
 * tradeId so the journal can be retrieved on any surface that knows
 * the trade (BotCard, PortfolioPage, JournalPage).
 *
 * Local-only — survives page reloads, scoped to this browser. No sync.
 * If the user clears the bot ledger, the journal entries remain
 * (referencing now-missing trades is intentional; the entry is still
 * a valuable record).
 */

import { create } from 'zustand'

const STORAGE_KEY = 'tc-journal-v1'

export interface JournalEntry {
  tradeId: string
  note: string
  tags: string[]
  /** 0..5 self-grade of trade quality (not PnL — execution and idea quality). 0 = unrated. */
  rating: number
  updatedAt: number
}

interface PersistedShape {
  entries: Record<string, JournalEntry>
}

function load(): PersistedShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { entries: {} }
    const parsed = JSON.parse(raw) as Partial<PersistedShape>
    return { entries: parsed.entries ?? {} }
  } catch {
    return { entries: {} }
  }
}

function persist(state: PersistedShape): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* quota */ }
}

interface JournalStore {
  entries: Record<string, JournalEntry>
  /** Upsert. Empty notes + zero tags + 0 rating = treated as delete. */
  setEntry: (tradeId: string, patch: Partial<Omit<JournalEntry, 'tradeId' | 'updatedAt'>>) => void
  removeEntry: (tradeId: string) => void
  getEntry: (tradeId: string) => JournalEntry | undefined
}

export const useJournalStore = create<JournalStore>((set, get) => {
  const initial = load()
  return {
    entries: initial.entries,
    setEntry: (tradeId, patch) => {
      const existing = get().entries[tradeId]
      const next: JournalEntry = {
        tradeId,
        note: patch.note ?? existing?.note ?? '',
        tags: patch.tags ?? existing?.tags ?? [],
        rating: patch.rating ?? existing?.rating ?? 0,
        updatedAt: Date.now(),
      }
      // Treat fully-empty entries as deletes — keeps the store tidy.
      const isEmpty = next.note.trim() === '' && next.tags.length === 0 && next.rating === 0
      const entries = isEmpty
        ? Object.fromEntries(Object.entries(get().entries).filter(([k]) => k !== tradeId))
        : { ...get().entries, [tradeId]: next }
      set({ entries })
      persist({ entries })
    },
    removeEntry: (tradeId) => {
      const entries = Object.fromEntries(Object.entries(get().entries).filter(([k]) => k !== tradeId))
      set({ entries })
      persist({ entries })
    },
    getEntry: (tradeId) => get().entries[tradeId],
  }
})
