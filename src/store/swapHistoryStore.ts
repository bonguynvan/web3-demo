/**
 * swapHistoryStore — persists recent spot swap records in localStorage.
 *
 * Since we don't have a backend indexer for Arbitrum spot swaps,
 * swap history is tracked client-side from successful swap executions.
 * Stored per-address in localStorage so it survives page reloads.
 */

import { create } from 'zustand'

export interface SwapHistoryEntry {
  id: string
  timestamp: number
  txHash: `0x${string}`
  sellToken: { symbol: string; address: string }
  buyToken: { symbol: string; address: string }
  sellAmount: string
  buyAmount: string
  /** Human-readable exchange rate at time of swap. */
  price: number
  status: 'confirmed' | 'failed'
}

const STORAGE_KEY_PREFIX = 'swap-history-'
const MAX_ENTRIES = 50

function loadHistory(address: string): SwapHistoryEntry[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${address.toLowerCase()}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistory(address: string, entries: SwapHistoryEntry[]): void {
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${address.toLowerCase()}`,
      JSON.stringify(entries.slice(0, MAX_ENTRIES)),
    )
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

interface SwapHistoryState {
  entries: SwapHistoryEntry[]
  loadForAddress: (address: string) => void
  addEntry: (address: string, entry: SwapHistoryEntry) => void
  clear: (address: string) => void
}

export const useSwapHistoryStore = create<SwapHistoryState>((set, get) => ({
  entries: [],

  loadForAddress: (address) => {
    set({ entries: loadHistory(address) })
  },

  addEntry: (address, entry) => {
    const updated = [entry, ...get().entries].slice(0, MAX_ENTRIES)
    set({ entries: updated })
    saveHistory(address, updated)
  },

  clear: (address) => {
    set({ entries: [] })
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${address.toLowerCase()}`)
  },
}))
