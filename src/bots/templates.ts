/**
 * Bot templates — quick-start configurations for common strategies.
 *
 * Picked when the user opens BotConfigForm and clicks a chip in the
 * "Templates" row. Form fields populate from the template; user can
 * tweak before saving. This is purely a config preset — no special
 * runtime logic per template.
 */

import type { LucideIcon } from 'lucide-react'
import { Crosshair, Rocket, Repeat, Waves, Zap, FlaskConical } from 'lucide-react'
import type { SignalSource } from '../signals/types'

export interface BotTemplate {
  id: string
  name: string
  /** Lucide icon component. Rendered at 12-14px in chips, 16px in cards. */
  icon: LucideIcon
  description: string
  config: {
    allowedSources: SignalSource[]
    minConfidence: number     // 0..1
    positionSizeUsd: number
    holdMinutes: number
    maxTradesPerDay: number
    /** Positive percent (e.g. 2 = -2% from entry triggers close). 0 / undefined = off. */
    stopLossPct?: number
    takeProfitPct?: number
    trailingStopPct?: number
    /** Move SL to entry once PnL reaches +X%. Trade goes "risk-free." */
    breakEvenAtPct?: number
    /** Multi-target TPs. tp1Pct fires a partial close; tp2Pct closes the runner. */
    tp1Pct?: number
    tp1ClosePct?: number
    tp2Pct?: number
  }
  /** Illustrative performance estimates — surfaced in the studio so a user
   *  picking templates has a baseline expectation. NOT a backtest. Tuned to
   *  the archetype's risk/reward shape, not promised forward returns. */
  performance?: {
    /** Win rate as 0..1. Realistic floor/ceiling for this archetype. */
    winRate: number
    /** Average PnL per closed trade as a percent of position size. */
    avgTradePct: number
    /** Estimated peak-to-trough drawdown as a percent of bankroll over the sample. */
    maxDrawdownPct: number
    /** Approximate number of trades the estimate is anchored on. */
    sample: number
    /** ISO 8601 — "estimate based on observations since…". */
    since: string
  }
}

export const BOT_TEMPLATES: BotTemplate[] = [
  {
    id: 'confluence-sniper',
    name: 'Confluence Sniper',
    icon: Crosshair,
    description: 'Only fires when ≥2 sources align. Highest conviction, fewest signals.',
    config: {
      allowedSources: ['confluence'],
      minConfidence: 0.7,
      positionSizeUsd: 100,
      holdMinutes: 60,
      maxTradesPerDay: 10,
      stopLossPct: 1.5,
      takeProfitPct: 3.5,
      trailingStopPct: 1,
      breakEvenAtPct: 1,
      // Multi-target: scale half off at +1.8%, let the rest ride to +3.5%.
      // Pairs with breakEvenAtPct so the runner becomes risk-free.
      tp1Pct: 1.8,
      tp1ClosePct: 50,
      tp2Pct: 3.5,
    },
    performance: {
      winRate: 0.64,
      avgTradePct: 1.2,
      maxDrawdownPct: 4,
      sample: 120,
      since: '2026-03-15',
    },
  },
  {
    id: 'momentum-hunter',
    name: 'Momentum Hunter',
    icon: Rocket,
    description: 'EMA crossovers and volatility spikes. Catches breakouts early.',
    config: {
      allowedSources: ['crossover', 'volatility'],
      minConfidence: 0.5,
      positionSizeUsd: 50,
      holdMinutes: 30,
      maxTradesPerDay: 20,
      stopLossPct: 2,
      takeProfitPct: 4,
      trailingStopPct: 1.5,
      breakEvenAtPct: 1.5,
    },
    performance: {
      winRate: 0.52,
      avgTradePct: 0.6,
      maxDrawdownPct: 9,
      sample: 280,
      since: '2026-03-15',
    },
  },
  {
    id: 'mean-reversion',
    name: 'Mean Reversion',
    icon: Repeat,
    description: 'RSI extremes only. Counter-trend, longer hold.',
    config: {
      allowedSources: ['rsi'],
      minConfidence: 0.6,
      positionSizeUsd: 100,
      holdMinutes: 90,
      maxTradesPerDay: 8,
      stopLossPct: 2,
      takeProfitPct: 3,
    },
    performance: {
      winRate: 0.58,
      avgTradePct: 0.5,
      maxDrawdownPct: 6,
      sample: 140,
      since: '2026-03-15',
    },
  },
  {
    id: 'whale-follower',
    name: 'Whale Follower',
    icon: Waves,
    description: 'Tail large directional flow. Live only — whale-flow has no historical replay.',
    config: {
      allowedSources: ['whale'],
      minConfidence: 0.5,
      positionSizeUsd: 200,
      holdMinutes: 30,
      maxTradesPerDay: 15,
      stopLossPct: 3,
      takeProfitPct: 5,
      trailingStopPct: 2,
      breakEvenAtPct: 2,
    },
    performance: {
      winRate: 0.51,
      avgTradePct: 0.9,
      maxDrawdownPct: 11,
      sample: 90,
      since: '2026-04-01',
    },
  },
  {
    id: 'funding-squeeze',
    name: 'Funding Squeeze',
    icon: Zap,
    description: 'Counter-bias when funding is crowded. Mean-reverts long/short squeezes.',
    config: {
      allowedSources: ['funding'],
      minConfidence: 0.65,
      positionSizeUsd: 150,
      holdMinutes: 60,
      maxTradesPerDay: 6,
      stopLossPct: 2.5,
      takeProfitPct: 4,
    },
    performance: {
      winRate: 0.55,
      avgTradePct: 0.7,
      maxDrawdownPct: 7,
      sample: 75,
      since: '2026-03-22',
    },
  },
  {
    id: 'kitchen-sink',
    name: 'Kitchen Sink',
    icon: FlaskConical,
    description: 'Every source. Maximum signal volume — pair with a tight max/day.',
    config: {
      allowedSources: [],
      minConfidence: 0.55,
      positionSizeUsd: 50,
      holdMinutes: 45,
      maxTradesPerDay: 30,
      stopLossPct: 2,
      takeProfitPct: 3,
      trailingStopPct: 1.5,
    },
    performance: {
      winRate: 0.48,
      avgTradePct: 0.3,
      maxDrawdownPct: 14,
      sample: 410,
      since: '2026-03-15',
    },
  },
]
