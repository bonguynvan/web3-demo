/**
 * Risk-profile presets — canonical defaults for the 3 user archetypes:
 *
 *   • conservative — "secure profits" / slow & steady. Tight stops,
 *     modest take-profits, longer holds, fewer trades. Defaults bias
 *     toward survival over upside.
 *
 *   • balanced — middle of the road. Sensible defaults for the average
 *     user who wants the bot to "just work."
 *
 *   • aggressive — "quick money" / scalpers. Wider take-profits, more
 *     trades, larger size relative to bankroll. Higher variance.
 *
 *   • custom — the implicit fallback once the user tunes values away
 *     from any preset. No defaults bundle.
 *
 * The studio (BotConfigForm) writes these as the *starting* values; the
 * user is free to tune from there. Badge color + sort order in the
 * leaderboard derive from the same labels.
 */

import type { LucideIcon } from 'lucide-react'
import { Shield, Scale, Flame } from 'lucide-react'
import type { BotRiskProfile } from './types'

export interface RiskProfileBundle {
  /** Display label and sort key. */
  label: string
  /** Lucide icon component shown on chips and bot-card badges. */
  icon: LucideIcon
  /** One-line description for cards / pickers. */
  blurb: string
  /** Tailwind color token used by badges. */
  toneClass: string
  /** Bundle of defaults the studio applies on click. */
  defaults: {
    positionSizeUsd: number
    minConfidence: number    // 0..1
    holdMinutes: number
    maxTradesPerDay: number
    stopLossPct: number
    takeProfitPct: number
    trailingStopPct: number
    breakEvenAtPct: number
  }
}

export const RISK_PROFILES: Record<Exclude<BotRiskProfile, 'custom'>, RiskProfileBundle> = {
  conservative: {
    label: 'Conservative',
    icon: Shield,
    blurb: 'Tight stops, modest targets, fewer trades. Optimized for capital preservation.',
    toneClass: 'text-long border-long/40 bg-long/10',
    defaults: {
      positionSizeUsd: 50,
      minConfidence: 0.75,
      holdMinutes: 240,
      maxTradesPerDay: 3,
      stopLossPct: 1,
      takeProfitPct: 2,
      trailingStopPct: 0.5,
      breakEvenAtPct: 0.7,
    },
  },
  balanced: {
    label: 'Balanced',
    icon: Scale,
    blurb: 'Default. Mid-range stops and hold times. Good baseline before tuning.',
    toneClass: 'text-accent border-accent/40 bg-accent-dim/30',
    defaults: {
      positionSizeUsd: 100,
      minConfidence: 0.6,
      holdMinutes: 60,
      maxTradesPerDay: 10,
      stopLossPct: 2,
      takeProfitPct: 4,
      trailingStopPct: 1,
      breakEvenAtPct: 1,
    },
  },
  aggressive: {
    label: 'Aggressive',
    icon: Flame,
    blurb: 'Wider targets, more trades, larger size. Higher variance — pair with strict daily caps.',
    toneClass: 'text-short border-short/40 bg-short/10',
    defaults: {
      positionSizeUsd: 200,
      minConfidence: 0.5,
      holdMinutes: 15,
      maxTradesPerDay: 30,
      stopLossPct: 3,
      takeProfitPct: 6,
      trailingStopPct: 2,
      breakEvenAtPct: 2,
    },
  },
}

/** Order used for pickers + leaderboard sort. Conservative first to nudge defaults. */
export const RISK_PROFILE_ORDER: ReadonlyArray<Exclude<BotRiskProfile, 'custom'>> = [
  'conservative',
  'balanced',
  'aggressive',
]

/** Resolve a (possibly missing) profile to its bundle. Falls back to balanced. */
export function profileBundle(p: BotRiskProfile | undefined): RiskProfileBundle {
  if (p && p !== 'custom') return RISK_PROFILES[p]
  return RISK_PROFILES.balanced
}
