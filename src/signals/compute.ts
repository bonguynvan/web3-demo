/**
 * Signal compute — pure functions that derive Signals from venue state.
 *
 * Each source is a function that takes whatever inputs it needs and
 * returns Signal[]. The aggregator unions them. No I/O, no React, no
 * side effects — just data → signals.
 */

import type { VenueId, Ticker, Market, PublicTrade } from '../adapters/types'
import type { CandleData } from '../types/trading'
import type { Signal } from './types'

const HOUR = 60 * 60 * 1000
const SIGNAL_TTL_DEFAULT = 30 * 60 * 1000  // 30 min

// ─── Source 1: Funding-rate extremes (perp markets only) ──────────────
//
// Hyperliquid funding is per-hour and quoted as a fraction (e.g.
// 0.000125 = 0.0125%/hr). Cross-venue we keep things in fraction form
// and threshold at +-0.01%/hr — high enough that long/short squeeze
// risk is real, low enough to fire a few times a day on volatile pairs.
const FUNDING_THRESHOLD = 0.0001  // 0.01% per funding period

export function fundingSignals(
  venue: VenueId,
  markets: Market[],
  tickers: Map<string, Ticker>,
  now: number = Date.now(),
): Signal[] {
  const out: Signal[] = []
  for (const m of markets) {
    if (m.kind !== 'perp') continue
    const t = tickers.get(m.id)
    if (!t || t.fundingRate === undefined) continue

    const f = t.fundingRate
    if (Math.abs(f) < FUNDING_THRESHOLD) continue

    // Positive funding = longs pay shorts → crowded longs → short bias
    // Negative funding = shorts pay longs → crowded shorts → long bias
    const direction = f > 0 ? 'short' : 'long'
    const confidence = Math.min(1, Math.abs(f) / (FUNDING_THRESHOLD * 5))
    const pct = (f * 100).toFixed(4)

    out.push({
      id: `funding:${m.id}:${Math.floor(now / HOUR)}`,
      source: 'funding',
      venue,
      marketId: m.id,
      direction,
      confidence,
      triggeredAt: now,
      expiresAt: now + HOUR,
      title: `Funding ${f > 0 ? 'spike' : 'inversion'}`,
      detail: `${m.id} funding at ${f >= 0 ? '+' : ''}${pct}%/hr — ${
        direction === 'short' ? 'crowded longs' : 'crowded shorts'
      } setup`,
      suggestedPrice: t.price,
    })
  }
  return out
}

// ─── Source 2: EMA crossover on the active market's candles ──────────

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return []
  const k = 2 / (period + 1)
  const out: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k))
  }
  return out
}

export function crossoverSignals(
  venue: VenueId,
  marketId: string,
  candles: CandleData[],
  fastPeriod = 9,
  slowPeriod = 21,
  now: number = Date.now(),
): Signal[] {
  if (candles.length < slowPeriod + 2) return []
  const closes = candles.map(c => c.close)
  const fast = ema(closes, fastPeriod)
  const slow = ema(closes, slowPeriod)

  const lastFast = fast[fast.length - 1]
  const lastSlow = slow[slow.length - 1]
  const prevFast = fast[fast.length - 2]
  const prevSlow = slow[slow.length - 2]

  const crossedUp = prevFast <= prevSlow && lastFast > lastSlow
  const crossedDown = prevFast >= prevSlow && lastFast < lastSlow
  if (!crossedUp && !crossedDown) return []

  const direction = crossedUp ? 'long' : 'short'
  const lastBar = candles[candles.length - 1]
  const gap = Math.abs(lastFast - lastSlow) / lastSlow
  const confidence = Math.min(1, gap * 100)

  return [{
    id: `crossover:${marketId}:${lastBar.time}`,
    source: 'crossover',
    venue,
    marketId,
    direction,
    confidence,
    triggeredAt: now,
    expiresAt: now + SIGNAL_TTL_DEFAULT,
    title: `EMA${fastPeriod}/${slowPeriod} ${crossedUp ? 'golden' : 'death'} cross`,
    detail: `${marketId} fast EMA crossed ${crossedUp ? 'above' : 'below'} slow on the latest bar`,
    suggestedPrice: lastBar.close,
  }]
}

// ─── Source 3: Whale flow on the active market's trades ─────────────
//
// Looks at the last 60s of above-threshold trades and fires when one
// side dominates the notional. Confidence scales with both total
// notional and skew strength so a balanced $5M minute does not look
// like a directional setup.

const WHALE_WINDOW_MS = 60 * 1000
const WHALE_MIN_TOTAL_USD = 100_000
const WHALE_MIN_SKEW = 0.6

export function whaleFlowSignals(
  venue: VenueId,
  marketId: string,
  trades: PublicTrade[],
  now: number = Date.now(),
): Signal[] {
  if (trades.length === 0) return []

  let buyNotional = 0
  let sellNotional = 0
  let lastPrice = 0
  for (const t of trades) {
    if (now - t.timestamp > WHALE_WINDOW_MS) continue
    const n = t.price * t.size
    if (t.side === 'buy') buyNotional += n
    else sellNotional += n
    lastPrice = t.price
  }
  const total = buyNotional + sellNotional
  if (total < WHALE_MIN_TOTAL_USD) return []

  const skew = (buyNotional - sellNotional) / total
  if (Math.abs(skew) < WHALE_MIN_SKEW) return []

  const direction = skew > 0 ? 'long' : 'short'
  // 50% from total ($1M = full), 50% from skew above threshold
  const sizeScore = Math.min(1, total / 1_000_000)
  const skewScore = (Math.abs(skew) - WHALE_MIN_SKEW) / (1 - WHALE_MIN_SKEW)
  const confidence = sizeScore * 0.5 + Math.min(1, skewScore) * 0.5

  return [{
    id: `whale:${marketId}:${Math.floor(now / 30_000)}`,  // dedup per 30s
    source: 'whale',
    venue,
    marketId,
    direction,
    confidence,
    triggeredAt: now,
    expiresAt: now + 5 * 60_000,
    title: `Whale ${direction === 'long' ? 'buy' : 'sell'} flow`,
    detail: `$${(total / 1000).toFixed(0)}k notional in 60s, ${
      Math.round(skew * 100)
    }% ${direction} skew`,
    suggestedPrice: lastPrice || undefined,
  }]
}

// ─── Aggregator ───────────────────────────────────────────────────────

export interface ComputeInputs {
  venue: VenueId
  markets: Market[]
  tickers: Map<string, Ticker>
  selectedMarketId: string
  candles: CandleData[]
  largeTrades: PublicTrade[]
}

export function computeSignals(inputs: ComputeInputs, now: number = Date.now()): Signal[] {
  const { venue, markets, tickers, selectedMarketId, candles, largeTrades } = inputs
  return [
    ...fundingSignals(venue, markets, tickers, now),
    ...crossoverSignals(venue, selectedMarketId, candles, 9, 21, now),
    ...whaleFlowSignals(venue, selectedMarketId, largeTrades, now),
  ].sort((a, b) => b.confidence - a.confidence)
}
