/**
 * Strategy library — curated bot configs published as a marketplace MVP.
 *
 * Schema is venue-agnostic: each strategy ships a PortableBot (the same
 * v:1 schema used by import/export) so "Add to my bots" round-trips
 * cleanly through the existing botStore lifecycle.
 *
 * Today this is a static seed list — future versions can fetch from
 * `/api/strategies` without changing the page that consumes it.
 */

import type { PortableBot } from '../bots/portable'

export interface StrategyAuthor {
  name: string
  handle?: string
}

export interface StrategyPerformance {
  /** 0..1 */
  winRate: number
  /** Number of paper trades the win rate is computed over. */
  sample: number
  /** ISO 8601 date — "tracked since". */
  since: string
}

export interface PublishedStrategy {
  id: string
  slug: string
  name: string
  author: StrategyAuthor
  summary: string
  tags: string[]
  bot: PortableBot
  performance?: StrategyPerformance
}

export const STRATEGY_LIBRARY: PublishedStrategy[] = [
  {
    id: 'tdk-confluence-classic',
    slug: 'confluence-classic',
    name: 'Confluence Classic',
    author: { name: 'TradingDek Team', handle: '@tradingdek' },
    summary: 'High-conviction setups only. Fires when ≥2 sources agree on direction. Conservative size, longer hold.',
    tags: ['confluence', 'conservative', 'starter'],
    bot: {
      v: 1,
      name: 'Confluence Classic',
      mode: 'paper',
      allowedSources: ['confluence'],
      allowedMarkets: [],
      minConfidence: 0.75,
      positionSizeUsd: 100,
      holdMinutes: 90,
      maxTradesPerDay: 8,
    },
    performance: { winRate: 0.62, sample: 48, since: '2026-04-01' },
  },
  {
    id: 'tdk-funding-fade',
    slug: 'funding-fade',
    name: 'Funding Fade',
    author: { name: 'TradingDek Team', handle: '@tradingdek' },
    summary: 'Counter-trades crowded perp positioning. Long when shorts pay longs; short when longs pay shorts.',
    tags: ['funding', 'mean-reversion', 'perp'],
    bot: {
      v: 1,
      name: 'Funding Fade',
      mode: 'paper',
      allowedSources: ['funding'],
      allowedMarkets: [],
      minConfidence: 0.6,
      positionSizeUsd: 75,
      holdMinutes: 240,
      maxTradesPerDay: 6,
    },
    performance: { winRate: 0.58, sample: 33, since: '2026-04-10' },
  },
  {
    id: 'tdk-volatility-momentum',
    slug: 'volatility-momentum',
    name: 'Volatility Momentum',
    author: { name: 'TradingDek Team', handle: '@tradingdek' },
    summary: 'Rides outsized breakout bars in the bar-direction. Short hold, fast turnover, ignores funding.',
    tags: ['volatility', 'momentum', 'fast'],
    bot: {
      v: 1,
      name: 'Volatility Momentum',
      mode: 'paper',
      allowedSources: ['volatility', 'crossover'],
      allowedMarkets: [],
      minConfidence: 0.55,
      positionSizeUsd: 50,
      holdMinutes: 30,
      maxTradesPerDay: 20,
    },
  },
  {
    id: 'tdk-whale-follow',
    slug: 'whale-follow',
    name: 'Whale Follow',
    author: { name: 'TradingDek Team', handle: '@tradingdek' },
    summary: 'Mirrors aggressive whale flow. Position size scales with the underlying skew confidence.',
    tags: ['whale', 'flow', 'aggressive'],
    bot: {
      v: 1,
      name: 'Whale Follow',
      mode: 'paper',
      allowedSources: ['whale'],
      allowedMarkets: [],
      minConfidence: 0.65,
      positionSizeUsd: 100,
      holdMinutes: 45,
      maxTradesPerDay: 15,
    },
    performance: { winRate: 0.54, sample: 92, since: '2026-03-20' },
  },
  {
    id: 'tdk-rsi-revert',
    slug: 'rsi-reversion',
    name: 'RSI Reversion',
    author: { name: 'TradingDek Team', handle: '@tradingdek' },
    summary: 'Buys oversold extremes and shorts overbought ones. Single-source mean reversion, larger position.',
    tags: ['rsi', 'mean-reversion'],
    bot: {
      v: 1,
      name: 'RSI Reversion',
      mode: 'paper',
      allowedSources: ['rsi'],
      allowedMarkets: [],
      minConfidence: 0.6,
      positionSizeUsd: 150,
      holdMinutes: 120,
      maxTradesPerDay: 10,
    },
  },
]
