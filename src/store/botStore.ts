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
