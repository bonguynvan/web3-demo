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
import type { BotConfig, BotTrade, BotExitReason } from '../bots/types'

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

/**
 * Picks the next available fork name: "Confluence Sniper (fork)",
 * then "(fork 2)", "(fork 3)", etc. Keeps the lineage discoverable in
 * the bot list without spammy timestamps.
 */
function nextForkName(existing: BotConfig[], baseName: string): string {
  const taken = new Set(existing.map(b => b.name))
  // Strip any existing "(fork N)" suffix on the source so a fork-of-a-fork
  // doesn't drift into "Confluence Sniper (fork) (fork) (fork 2)".
  const root = baseName.replace(/\s*\(fork(?:\s+\d+)?\)\s*$/, '')
  const candidate = (n: number) => n === 1 ? `${root} (fork)` : `${root} (fork ${n})`
  for (let n = 1; n < 1000; n++) {
    const c = candidate(n)
    if (!taken.has(c)) return c
  }
  return `${root} (fork)`
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
  setMode: (id: string, mode: 'paper' | 'live') => void
  removeBot: (id: string) => void
  addBot: (cfg: Omit<BotConfig, 'id' | 'createdAt'>) => void
  /** Clone an existing bot's config into a new bot, recording the lineage.
   *  Returns the new bot id or null if the source isn't found. */
  forkBot: (sourceId: string) => string | null
  recordTrade: (trade: BotTrade) => void
  closeTrade: (tradeId: string, closePrice: number, closedAt: number, exitReason?: BotExitReason) => void
  updateTradePeak: (tradeId: string, peakPnlPct: number) => void
  markSlMovedToBreakEven: (tradeId: string) => void
  /** Realize a partial close at TP1. Reduces the trade's size and
   *  positionUsd to the remainder and records the locked-in PnL. */
  partialCloseTrade: (tradeId: string, fillPrice: number, partialSize: number, partialPnlUsd: number) => void
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

    setMode: (id, mode) => set(state => {
      const bots = state.bots.map(b => b.id === id ? { ...b, mode } : b)
      persist({ bots, trades: state.trades })
      return { bots }
    }),

    removeBot: (id) => set(state => {
      const bots = state.bots.filter(b => b.id !== id)
      persist({ bots, trades: state.trades })
      // Cross-store cleanup: drop any shadows of this bot. Dynamic import
      // to avoid a circular dep at module load time.
      void import('./shadowStore').then(m => m.useShadowStore.getState().removeShadowsForParent(id))
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

    forkBot: (sourceId) => {
      // Need to return the new id, so we read state synchronously, mutate
      // via set, then return. Avoids zustand's set-returns-state contract.
      let newId: string | null = null
      set(state => {
        const source = state.bots.find(b => b.id === sourceId)
        if (!source) return state
        const id = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        newId = id
        const child: BotConfig = {
          ...source,
          id,
          name: nextForkName(state.bots, source.name),
          enabled: false, // safer default — user toggles after review
          // Mode of fork: paper unless source was already paper, in which
          // case preserve. Never auto-fork into live.
          mode: 'paper',
          parentId: source.id,
          parentKind: 'bot',
          forkedAt: Date.now(),
          createdAt: Date.now(),
        }
        const bots = [...state.bots, child]
        persist({ bots, trades: state.trades })
        return { bots }
      })
      return newId
    },

    recordTrade: (trade) => set(state => {
      const trades = [trade, ...state.trades].slice(0, 500)  // ledger cap
      persist({ bots: state.bots, trades })
      return { trades }
    }),

    closeTrade: (tradeId, closePrice, closedAt, exitReason) => set(state => {
      const trades = state.trades.map(t => {
        if (t.id !== tradeId) return t
        const sign = t.direction === 'long' ? 1 : -1
        // Remainder PnL after any TP1 partial. trade.size already reflects
        // the remaining position; trade.tp1ClosedPnlUsd holds what was
        // realized at TP1 (if anything).
        const remainderPnl = sign * (closePrice - t.entryPrice) * t.size
        const pnlUsd = remainderPnl + (t.tp1ClosedPnlUsd ?? 0)
        return {
          ...t,
          closedAt,
          closePrice,
          pnlUsd,
          exitReason: exitReason ?? t.exitReason ?? 'hold_expired',
        }
      })
      persist({ bots: state.bots, trades })
      return { trades }
    }),

    updateTradePeak: (tradeId, peakPnlPct) => set(state => {
      let changed = false
      const trades = state.trades.map(t => {
        if (t.id !== tradeId) return t
        const prior = t.peakPnlPct ?? -Infinity
        if (peakPnlPct <= prior) return t
        changed = true
        return { ...t, peakPnlPct }
      })
      if (!changed) return state
      persist({ bots: state.bots, trades })
      return { trades }
    }),

    markSlMovedToBreakEven: (tradeId) => set(state => {
      let changed = false
      const trades = state.trades.map(t => {
        if (t.id !== tradeId) return t
        if (t.slMovedToBreakEven) return t
        changed = true
        return { ...t, slMovedToBreakEven: true }
      })
      if (!changed) return state
      persist({ bots: state.bots, trades })
      return { trades }
    }),

    partialCloseTrade: (tradeId, fillPrice, partialSize, partialPnlUsd) => set(state => {
      let changed = false
      const trades = state.trades.map(t => {
        if (t.id !== tradeId) return t
        if (t.tp1Hit) return t
        // Reduce position by the partial size — protect against rounding
        // going negative.
        const remainingSize = Math.max(0, t.size - partialSize)
        if (remainingSize === 0) {
          // Fully closed at TP1 — record the partial PnL as the full PnL
          // and stamp closedAt. Avoids leaving a phantom 0-size open trade.
          changed = true
          return {
            ...t,
            tp1Hit: true,
            tp1ClosedPnlUsd: partialPnlUsd,
            size: 0,
            positionUsd: 0,
            closedAt: Date.now(),
            closePrice: fillPrice,
            pnlUsd: partialPnlUsd,
            exitReason: 'tp1_partial' as const,
          }
        }
        // Scale positionUsd proportionally — `positionUsd / size` is the
        // entry price baseline; we keep the per-unit valuation steady.
        const remainingUsd = t.size > 0 ? (t.positionUsd * remainingSize) / t.size : 0
        changed = true
        return {
          ...t,
          tp1Hit: true,
          tp1ClosedPnlUsd: (t.tp1ClosedPnlUsd ?? 0) + partialPnlUsd,
          size: remainingSize,
          positionUsd: remainingUsd,
        }
      })
      if (!changed) return state
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
