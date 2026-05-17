/**
 * shadowStore — phantom bot variants + their parallel trade ledger.
 *
 * Separate from botStore so the real bot's win-rate/PnL stays clean.
 * Same persistence model: localStorage with a small ledger cap.
 */

import { create } from 'zustand'
import type { ShadowBot, ShadowOverrides, ShadowTrade } from '../bots/shadowTypes'
import type { BotExitReason } from '../bots/types'

const STORAGE_KEY = 'tc-shadows-v1'
const LEDGER_CAP = 500

interface PersistedShape {
  shadows: ShadowBot[]
  trades: ShadowTrade[]
}

function load(): PersistedShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { shadows: [], trades: [] }
    const parsed = JSON.parse(raw) as Partial<PersistedShape>
    return {
      shadows: parsed.shadows ?? [],
      trades: parsed.trades ?? [],
    }
  } catch {
    return { shadows: [], trades: [] }
  }
}

function persist(state: PersistedShape): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* full */ }
}

interface ShadowStore {
  shadows: ShadowBot[]
  trades: ShadowTrade[]
  /** Create a shadow variant of a real bot with the given overrides. */
  addShadow: (parentBotId: string, name: string, overrides: ShadowOverrides) => string
  toggleShadow: (id: string) => void
  removeShadow: (id: string) => void
  /** Removes all shadows + trades for a given parent. Use when the
   *  parent bot is deleted to avoid orphan ledger entries. */
  removeShadowsForParent: (parentBotId: string) => void
  recordShadowTrade: (trade: ShadowTrade) => void
  closeShadowTrade: (id: string, closePrice: number, closedAt: number, exitReason?: BotExitReason) => void
  updateShadowTradePeak: (id: string, peakPnlPct: number) => void
  markShadowSlMovedToBreakEven: (id: string) => void
}

export const useShadowStore = create<ShadowStore>((set, get) => {
  const initial = load()
  return {
    shadows: initial.shadows,
    trades: initial.trades,

    addShadow: (parentBotId, name, overrides) => {
      const id = `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const shadow: ShadowBot = {
        id,
        parentBotId,
        name: name.trim() || 'Shadow',
        enabled: true,
        overrides,
        createdAt: Date.now(),
      }
      const shadows = [...get().shadows, shadow]
      set({ shadows })
      persist({ shadows, trades: get().trades })
      return id
    },

    toggleShadow: (id) => {
      const shadows = get().shadows.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
      set({ shadows })
      persist({ shadows, trades: get().trades })
    },

    removeShadow: (id) => {
      const shadows = get().shadows.filter(s => s.id !== id)
      const trades = get().trades.filter(t => t.shadowId !== id)
      set({ shadows, trades })
      persist({ shadows, trades })
    },

    removeShadowsForParent: (parentBotId) => {
      const orphanIds = new Set(get().shadows.filter(s => s.parentBotId === parentBotId).map(s => s.id))
      if (orphanIds.size === 0) return
      const shadows = get().shadows.filter(s => !orphanIds.has(s.id))
      const trades = get().trades.filter(t => !orphanIds.has(t.shadowId))
      set({ shadows, trades })
      persist({ shadows, trades })
    },

    recordShadowTrade: (trade) => {
      const trades = [trade, ...get().trades].slice(0, LEDGER_CAP)
      set({ trades })
      persist({ shadows: get().shadows, trades })
    },

    closeShadowTrade: (id, closePrice, closedAt, exitReason) => {
      const trades = get().trades.map(t => {
        if (t.id !== id) return t
        const sign = t.direction === 'long' ? 1 : -1
        const remainderPnl = sign * (closePrice - t.entryPrice) * t.size
        const pnlUsd = remainderPnl + (t.tp1ClosedPnlUsd ?? 0)
        return { ...t, closedAt, closePrice, pnlUsd, exitReason: exitReason ?? t.exitReason ?? 'hold_expired' }
      })
      set({ trades })
      persist({ shadows: get().shadows, trades })
    },

    updateShadowTradePeak: (id, peakPnlPct) => {
      let changed = false
      const trades = get().trades.map(t => {
        if (t.id !== id) return t
        if (peakPnlPct <= (t.peakPnlPct ?? -Infinity)) return t
        changed = true
        return { ...t, peakPnlPct }
      })
      if (!changed) return
      set({ trades })
      persist({ shadows: get().shadows, trades })
    },

    markShadowSlMovedToBreakEven: (id) => {
      let changed = false
      const trades = get().trades.map(t => {
        if (t.id !== id || t.slMovedToBreakEven) return t
        changed = true
        return { ...t, slMovedToBreakEven: true }
      })
      if (!changed) return
      set({ trades })
      persist({ shadows: get().shadows, trades })
    },
  }
})
