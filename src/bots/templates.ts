/**
 * Bot templates — quick-start configurations for common strategies.
 *
 * Picked when the user opens BotConfigForm and clicks a chip in the
 * "Templates" row. Form fields populate from the template; user can
 * tweak before saving. This is purely a config preset — no special
 * runtime logic per template.
 */

import type { SignalSource } from '../signals/types'

export interface BotTemplate {
  id: string
  name: string
  emoji: string
  description: string
  config: {
    allowedSources: SignalSource[]
    minConfidence: number     // 0..1
    positionSizeUsd: number
    holdMinutes: number
    maxTradesPerDay: number
  }
}

export const BOT_TEMPLATES: BotTemplate[] = [
  {
    id: 'confluence-sniper',
    name: 'Confluence Sniper',
    emoji: '🎯',
    description: 'Only fires when ≥2 sources align. Highest conviction, fewest signals.',
    config: {
      allowedSources: ['confluence'],
      minConfidence: 0.7,
      positionSizeUsd: 100,
      holdMinutes: 60,
      maxTradesPerDay: 10,
    },
  },
  {
    id: 'momentum-hunter',
    name: 'Momentum Hunter',
    emoji: '🚀',
    description: 'EMA crossovers and volatility spikes. Catches breakouts early.',
    config: {
      allowedSources: ['crossover', 'volatility'],
      minConfidence: 0.5,
      positionSizeUsd: 50,
      holdMinutes: 30,
      maxTradesPerDay: 20,
    },
  },
  {
    id: 'mean-reversion',
    name: 'Mean Reversion',
    emoji: '🔄',
    description: 'RSI extremes only. Counter-trend, longer hold.',
    config: {
      allowedSources: ['rsi'],
      minConfidence: 0.6,
      positionSizeUsd: 100,
      holdMinutes: 90,
      maxTradesPerDay: 8,
    },
  },
  {
    id: 'whale-follower',
    name: 'Whale Follower',
    emoji: '🐋',
    description: 'Tail large directional flow. Live only — whale-flow has no historical replay.',
    config: {
      allowedSources: ['whale'],
      minConfidence: 0.5,
      positionSizeUsd: 200,
      holdMinutes: 30,
      maxTradesPerDay: 15,
    },
  },
  {
    id: 'funding-squeeze',
    name: 'Funding Squeeze',
    emoji: '⚡',
    description: 'Counter-bias when funding is crowded. Mean-reverts long/short squeezes.',
    config: {
      allowedSources: ['funding'],
      minConfidence: 0.65,
      positionSizeUsd: 150,
      holdMinutes: 60,
      maxTradesPerDay: 6,
    },
  },
  {
    id: 'kitchen-sink',
    name: 'Kitchen Sink',
    emoji: '🧪',
    description: 'Every source. Maximum signal volume — pair with a tight max/day.',
    config: {
      allowedSources: [],
      minConfidence: 0.55,
      positionSizeUsd: 50,
      holdMinutes: 45,
      maxTradesPerDay: 30,
    },
  },
]
