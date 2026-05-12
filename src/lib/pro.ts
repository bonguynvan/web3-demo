/**
 * Pro entitlement derivation.
 *
 * Single source of truth for "is this user Pro right now?" decisions.
 * Backend already computes `pro_active` per-day; this helper also
 * surfaces the *reason* (trial / days / paygo) so the UI can show a
 * sensible countdown.
 */

import type { Me } from '../api/auth'

export type ProSource = 'trial' | 'days' | 'paygo' | 'none'

export interface ProState {
  active: boolean
  source: ProSource
  /** Days remaining on the current source (-1 if not applicable). */
  daysLeft: number
  /** Paygo balance in USD (always present, even when source isn't paygo). */
  balanceUsd: number
}

export function deriveProState(me: Me | null): ProState {
  if (!me) {
    return { active: false, source: 'none', daysLeft: -1, balanceUsd: 0 }
  }

  const balance = me.paygo_balance_usd

  if (me.trial_expires_at) {
    const exp = Date.parse(me.trial_expires_at)
    if (!Number.isNaN(exp) && exp > Date.now()) {
      const ms = exp - Date.now()
      return {
        active: true,
        source: 'trial',
        daysLeft: Math.max(0, Math.ceil(ms / 86_400_000)),
        balanceUsd: balance,
      }
    }
  }

  if (me.pro_days_remaining > 0) {
    return {
      active: me.pro_active,
      source: 'days',
      daysLeft: me.pro_days_remaining,
      balanceUsd: balance,
    }
  }

  if (me.pro_active && balance > 0) {
    return {
      active: true,
      source: 'paygo',
      daysLeft: Math.floor(balance / 0.10),
      balanceUsd: balance,
    }
  }

  return { active: false, source: 'none', daysLeft: -1, balanceUsd: balance }
}

export function labelForSource(s: ProSource): string {
  switch (s) {
    case 'trial': return 'Trial'
    case 'days':  return 'Pro'
    case 'paygo': return 'Pay-as-you-go'
    case 'none':  return 'Free'
  }
}
