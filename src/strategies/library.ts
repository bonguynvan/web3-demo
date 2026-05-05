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

export type StrategyKind = 'curated' | 'community'

export interface PublishedStrategy {
  id: string
  slug: string
  name: string
  author: StrategyAuthor
  summary: string
  tags: string[]
  bot: PortableBot
  performance?: StrategyPerformance
  /** Provenance — curated entries are vetted by the TradingDek team;
   *  community entries are user-published and shown with an unverified
   *  badge until the team reviews them. Defaults to 'curated' for
   *  backward compat with the existing seed list. */
  kind?: StrategyKind
  /** ISO 8601 publish date — used by the marketplace to sort newest-first
   *  and to compute "tracked since" when no explicit performance is set. */
  publishedAt?: string
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

  // ─── Community submissions (unverified) ──────────────────────────────
  {
    id: 'comm-fade-shorts',
    slug: 'fade-the-shorts',
    name: 'Fade The Shorts',
    author: { name: 'Anita K.', handle: '@anitatrades' },
    summary: 'Fades crowded shorts on funding inversions, but only when EMA crossover agrees on direction. Two-of-eight confluence variant.',
    tags: ['funding', 'crossover', 'community'],
    kind: 'community',
    publishedAt: '2026-04-22',
    bot: {
      v: 1,
      name: 'Fade The Shorts',
      mode: 'paper',
      allowedSources: ['confluence'],
      allowedMarkets: [],
      minConfidence: 0.7,
      positionSizeUsd: 80,
      holdMinutes: 60,
      maxTradesPerDay: 6,
    },
    performance: { winRate: 0.59, sample: 27, since: '2026-04-22' },
  },
  {
    id: 'comm-liq-cascades',
    slug: 'liq-hunter',
    name: 'Liq Hunter',
    author: { name: 'cryptoshrimp', handle: '@shrimpsays' },
    summary: 'Goes with the cascade. Opens immediately on liquidation signals, exits inside 20 minutes.',
    tags: ['liquidation', 'fast', 'community'],
    kind: 'community',
    publishedAt: '2026-04-28',
    bot: {
      v: 1,
      name: 'Liq Hunter',
      mode: 'paper',
      allowedSources: ['liquidation'],
      allowedMarkets: [],
      minConfidence: 0.5,
      positionSizeUsd: 60,
      holdMinutes: 20,
      maxTradesPerDay: 25,
    },
  },
  {
    id: 'comm-bigcap-only',
    slug: 'bigcap-only',
    name: 'Big-Cap Only',
    author: { name: 'Maya R.', handle: '@mayatrade' },
    summary: 'Restricts to BTC and ETH. Slow, conservative, only acts on confluence ≥0.8. Built for sleep-friendly trading.',
    tags: ['confluence', 'conservative', 'community'],
    kind: 'community',
    publishedAt: '2026-05-01',
    bot: {
      v: 1,
      name: 'Big-Cap Only',
      mode: 'paper',
      allowedSources: ['confluence'],
      allowedMarkets: ['BTC/USDT', 'ETH/USDT'],
      minConfidence: 0.8,
      positionSizeUsd: 200,
      holdMinutes: 180,
      maxTradesPerDay: 4,
    },
    performance: { winRate: 0.66, sample: 18, since: '2026-05-01' },
  },
]
