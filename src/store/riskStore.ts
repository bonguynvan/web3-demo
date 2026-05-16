/**
 * riskStore — portfolio-level guardrails that auto-pause every bot when
 * a configured threshold is breached.
 *
 * Three independent caps:
 *   - dailyPnlCapUsd:  if today's realized PnL drops below -X, pause.
 *   - maxDrawdownUsd:  if (peak realized - current realized) ≥ X, pause.
 *   - maxExposureUsd:  if sum of open-bot notional ≥ X, refuse new opens.
 *
 * The store only HOLDS the limits + the latest breach + the per-cap
 * last-warning timestamps. The actual policy (compute, compare, warn,
 * pause) lives in the useRiskMonitor hook.
 *
 * 0 means "off" for any cap — disabled until the user picks a value.
 *
 * Proactive warning: at ≥80% utilization the monitor fires a toast.warning,
 * throttled per-cap via `lastWarnedAt` (cooldown lives in useRiskMonitor).
 */

import { create } from 'zustand'

const STORAGE_KEY = 'tc-risk-v1'

export type RiskCapKind = 'daily' | 'drawdown' | 'exposure'

export interface RiskLimits {
  dailyPnlCapUsd: number
  maxDrawdownUsd: number
  maxExposureUsd: number
  /** User-declared total tradeable equity. Drives risk-percent sizing:
   *  positionSize = (equity × riskPctPerTrade) / (entryPrice × stopLossPct/100).
   *  0 = unset; bots fall back to fixed-USD sizing. */
  accountEquityUsd: number
}

export interface RiskBreach {
  at: number
  reason: string
}

export type RiskWarnTimestamps = Record<RiskCapKind, number>

const ZERO_WARN: RiskWarnTimestamps = { daily: 0, drawdown: 0, exposure: 0 }

interface RiskState extends RiskLimits {
  breach: RiskBreach | null
  lastWarnedAt: RiskWarnTimestamps
  setLimits: (patch: Partial<RiskLimits>) => void
  setBreach: (reason: string) => void
  clearBreach: () => void
  markWarned: (kind: RiskCapKind) => void
}

const DEFAULTS: RiskLimits = {
  dailyPnlCapUsd: 0,
  maxDrawdownUsd: 0,
  maxExposureUsd: 0,
  accountEquityUsd: 0,
}

interface PersistedShape extends RiskLimits {
  breach: RiskBreach | null
  lastWarnedAt: RiskWarnTimestamps
}

function load(): PersistedShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS, breach: null, lastWarnedAt: { ...ZERO_WARN } }
    const parsed = JSON.parse(raw)
    const limits: RiskLimits = {
      dailyPnlCapUsd: Number(parsed.dailyPnlCapUsd) || 0,
      maxDrawdownUsd: Number(parsed.maxDrawdownUsd) || 0,
      maxExposureUsd: Number(parsed.maxExposureUsd) || 0,
      accountEquityUsd: Number(parsed.accountEquityUsd) || 0,
    }
    const breach = parsed.breach && typeof parsed.breach.at === 'number' && typeof parsed.breach.reason === 'string'
      ? { at: parsed.breach.at, reason: parsed.breach.reason }
      : null
    const w = parsed.lastWarnedAt ?? {}
    const lastWarnedAt: RiskWarnTimestamps = {
      daily: Number(w.daily) || 0,
      drawdown: Number(w.drawdown) || 0,
      exposure: Number(w.exposure) || 0,
    }
    return { ...limits, breach, lastWarnedAt }
  } catch {
    return { ...DEFAULTS, breach: null, lastWarnedAt: { ...ZERO_WARN } }
  }
}

function persist(state: PersistedShape) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* full */ }
}

export const useRiskStore = create<RiskState>((set, get) => {
  const initial = load()
  return {
    ...initial,
    setLimits: (patch) => {
      const { dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd, accountEquityUsd, breach, lastWarnedAt } = get()
      const next: RiskLimits = {
        dailyPnlCapUsd: patch.dailyPnlCapUsd ?? dailyPnlCapUsd,
        maxDrawdownUsd: patch.maxDrawdownUsd ?? maxDrawdownUsd,
        maxExposureUsd: patch.maxExposureUsd ?? maxExposureUsd,
        accountEquityUsd: patch.accountEquityUsd ?? accountEquityUsd,
      }
      set(next)
      persist({ ...next, breach, lastWarnedAt })
    },
    setBreach: (reason) => {
      const { dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd, accountEquityUsd, lastWarnedAt } = get()
      const breach: RiskBreach = { at: Date.now(), reason }
      set({ breach })
      persist({ dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd, accountEquityUsd, breach, lastWarnedAt })
    },
    clearBreach: () => {
      const { dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd, accountEquityUsd, lastWarnedAt } = get()
      set({ breach: null })
      persist({ dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd, accountEquityUsd, breach: null, lastWarnedAt })
    },
    markWarned: (kind) => {
      const { dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd, accountEquityUsd, breach, lastWarnedAt } = get()
      const next: RiskWarnTimestamps = { ...lastWarnedAt, [kind]: Date.now() }
      set({ lastWarnedAt: next })
      persist({ dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd, accountEquityUsd, breach, lastWarnedAt: next })
    },
  }
})
