/**
 * riskStore — portfolio-level guardrails that auto-pause every bot when
 * a configured threshold is breached.
 *
 * Three independent caps:
 *   - dailyPnlCapUsd:  if today's realized PnL drops below -X, pause.
 *   - maxDrawdownUsd:  if (peak realized - current realized) ≥ X, pause.
 *   - maxExposureUsd:  if sum of open-bot notional ≥ X, refuse new opens.
 *
 * The store only HOLDS the limits + the latest breach. The actual policy
 * (compute today's PnL, compare, disable bots) lives in the
 * useRiskMonitor hook so the store stays small and pure.
 *
 * 0 means "off" for any cap — disabled until the user picks a value.
 */

import { create } from 'zustand'

const STORAGE_KEY = 'tc-risk-v1'

export interface RiskLimits {
  dailyPnlCapUsd: number
  maxDrawdownUsd: number
  maxExposureUsd: number
}

export interface RiskBreach {
  at: number
  reason: string
}

interface RiskState extends RiskLimits {
  breach: RiskBreach | null
  setLimits: (patch: Partial<RiskLimits>) => void
  setBreach: (reason: string) => void
  clearBreach: () => void
}

const DEFAULTS: RiskLimits = {
  dailyPnlCapUsd: 0,
  maxDrawdownUsd: 0,
  maxExposureUsd: 0,
}

function load(): { limits: RiskLimits; breach: RiskBreach | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { limits: { ...DEFAULTS }, breach: null }
    const parsed = JSON.parse(raw)
    const limits: RiskLimits = {
      dailyPnlCapUsd: Number(parsed.dailyPnlCapUsd) || 0,
      maxDrawdownUsd: Number(parsed.maxDrawdownUsd) || 0,
      maxExposureUsd: Number(parsed.maxExposureUsd) || 0,
    }
    const breach = parsed.breach && typeof parsed.breach.at === 'number' && typeof parsed.breach.reason === 'string'
      ? { at: parsed.breach.at, reason: parsed.breach.reason }
      : null
    return { limits, breach }
  } catch {
    return { limits: { ...DEFAULTS }, breach: null }
  }
}

function persist(state: { limits: RiskLimits; breach: RiskBreach | null }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state.limits, breach: state.breach })) } catch { /* full */ }
}

export const useRiskStore = create<RiskState>((set, get) => {
  const initial = load()
  return {
    ...initial.limits,
    breach: initial.breach,
    setLimits: (patch) => {
      const { dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd, breach } = get()
      const next: RiskLimits = {
        dailyPnlCapUsd: patch.dailyPnlCapUsd ?? dailyPnlCapUsd,
        maxDrawdownUsd: patch.maxDrawdownUsd ?? maxDrawdownUsd,
        maxExposureUsd: patch.maxExposureUsd ?? maxExposureUsd,
      }
      set(next)
      persist({ limits: next, breach })
    },
    setBreach: (reason) => {
      const { dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd } = get()
      const breach: RiskBreach = { at: Date.now(), reason }
      set({ breach })
      persist({ limits: { dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd }, breach })
    },
    clearBreach: () => {
      const { dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd } = get()
      set({ breach: null })
      persist({ limits: { dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd }, breach: null })
    },
  }
})
