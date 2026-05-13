/**
 * referralStore — captures `?ref=<userId>` from incoming URLs and
 * remembers it across the session.
 *
 * The captured referrer is forwarded to the backend on SIWE verify
 * (when the server wires the `referrer` field) so both sides receive
 * a 7-day trial extension. Until the backend honors the field, this
 * store is the SPA surface that's already committed against —
 * server-side wiring stays a tiny patch.
 *
 * Persistence is localStorage; the value survives reloads so a user
 * who clicks a referral link today but signs in tomorrow still
 * credits the referrer.
 */

import { create } from 'zustand'

const KEY = 'tc-referral-v1'

interface Referral {
  by: string
  at: number
}

function load(): Referral | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as Referral
  } catch { return null }
}

function persist(r: Referral | null) {
  try {
    if (r) localStorage.setItem(KEY, JSON.stringify(r))
    else localStorage.removeItem(KEY)
  } catch { /* full */ }
}

interface ReferralState {
  ref: Referral | null
  capture: (by: string) => void
  clear: () => void
}

export const useReferralStore = create<ReferralState>(set => ({
  ref: load(),
  capture: by => {
    const r = { by, at: Date.now() }
    persist(r)
    set({ ref: r })
  },
  clear: () => {
    persist(null)
    set({ ref: null })
  },
}))
