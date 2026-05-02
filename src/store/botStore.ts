/**
 * botStore — bot configs + trade ledger.
 *
 * Zustand store backed by localStorage for the first cut. Survives
 * page reloads, scoped to the browser. Server-backed bots come in
 * Phase B2.
 *
 * Seeds a single demo bot on first run so users see the feature
 * working without a config UI.
 */

import { create } from 'zustand'
import type { BotConfig, BotTrade } from '../bots/types'

const STORAGE_KEY = 'tc-bots-v1'

interface PersistedShape {
  bots: BotConfig[]
  trades: BotTrade[]
}

function load(): PersistedShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seed()
    const parsed = JSON.parse(raw) as Partial<PersistedShape>
    return {
      bots: parsed.bots ?? [],
      trades: parsed.trades ?? [],
    }
  } catch {
    return seed()
  }
}

function persist(state: PersistedShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* full or denied */ }
}

function seed(): PersistedShape {
  const now = Date.now()
  return {
    bots: [{
      id: `bot-demo-${now}`,
      name: 'Confluence Sniper',
      enabled: true,
      mode: 'paper',
      allowedSources: ['confluence'],
      allowedMarkets: [],
      minConfidence: 0.7,
      positionSizeUsd: 100,
      holdMinutes: 60,
      maxTradesPerDay: 10,
      createdAt: now,
    }],
    trades: [],
  }
}

interface BotStore {
  bots: BotConfig[]
  trades: BotTrade[]

  toggleBot: (id: string) => void
  setAllEnabled: (enabled: boolean) => void
  renameBot: (id: string, name: string) => void
  removeBot: (id: string) => void
  addBot: (cfg: Omit<BotConfig, 'id' | 'createdAt'>) => void
  recordTrade: (trade: BotTrade) => void
  closeTrade: (tradeId: string, closePrice: number, closedAt: number) => void
  clearClosedTrades: () => void
}

export const useBotStore = create<BotStore>((set) => {
  const initial = load()
  return {
    bots: initial.bots,
    trades: initial.trades,

    toggleBot: (id) => set(state => {
      const bots = state.bots.map(b => b.id === id ? { ...b, enabled: !b.enabled } : b)
      persist({ bots, trades: state.trades })
      return { bots }
    }),

    setAllEnabled: (enabled) => set(state => {
      const bots = state.bots.map(b => b.enabled === enabled ? b : { ...b, enabled })
      persist({ bots, trades: state.trades })
      return { bots }
    }),

    renameBot: (id, name) => set(state => {
      const trimmed = name.trim()
      if (trimmed.length === 0) return state
      const bots = state.bots.map(b => b.id === id ? { ...b, name: trimmed.slice(0, 60) } : b)
      persist({ bots, trades: state.trades })
      return { bots }
    }),

    removeBot: (id) => set(state => {
      const bots = state.bots.filter(b => b.id !== id)
      persist({ bots, trades: state.trades })
      return { bots }
    }),

    addBot: (cfg) => set(state => {
      const bot: BotConfig = {
        ...cfg,
        id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
      }
      const bots = [...state.bots, bot]
      persist({ bots, trades: state.trades })
      return { bots }
    }),

    recordTrade: (trade) => set(state => {
      const trades = [trade, ...state.trades].slice(0, 500)  // ledger cap
      persist({ bots: state.bots, trades })
      return { trades }
    }),

    closeTrade: (tradeId, closePrice, closedAt) => set(state => {
      const trades = state.trades.map(t => {
        if (t.id !== tradeId) return t
        const sign = t.direction === 'long' ? 1 : -1
        const pnlUsd = sign * (closePrice - t.entryPrice) * t.size
        return { ...t, closedAt, closePrice, pnlUsd }
      })
      persist({ bots: state.bots, trades })
      return { trades }
    }),

    clearClosedTrades: () => set(state => {
      const trades = state.trades.filter(t => t.closedAt === undefined)
      persist({ bots: state.bots, trades })
      return { trades }
    }),
  }
})
