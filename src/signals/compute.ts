/**
 * Signal compute — pure functions that derive Signals from venue state.
 *
 * Each source is a function that takes whatever inputs it needs and
 * returns Signal[]. The aggregator unions them. No I/O, no React, no
 * side effects — just data → signals.
 */

import type { VenueId, Ticker, Market } from '../adapters/types'
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

// ─── Aggregator ───────────────────────────────────────────────────────

export interface ComputeInputs {
  venue: VenueId
  markets: Market[]
  tickers: Map<string, Ticker>
  selectedMarketId: string
  candles: CandleData[]
}

export function computeSignals(inputs: ComputeInputs, now: number = Date.now()): Signal[] {
  const { venue, markets, tickers, selectedMarketId, candles } = inputs
  return [
    ...fundingSignals(venue, markets, tickers, now),
    ...crossoverSignals(venue, selectedMarketId, candles, 9, 21, now),
  ].sort((a, b) => b.confidence - a.confidence)
}
