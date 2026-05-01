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
  trades: PublicTrade[],
  now: number = Date.now(),
): Signal[] {
  if (trades.length === 0) return []

  // Group trades by marketId — the buffer now spans top-N markets.
  interface Bucket { buy: number; sell: number; lastPrice: number }
  const buckets = new Map<string, Bucket>()
  for (const t of trades) {
    if (now - t.timestamp > WHALE_WINDOW_MS) continue
    const n = t.price * t.size
    let b = buckets.get(t.marketId)
    if (!b) { b = { buy: 0, sell: 0, lastPrice: 0 }; buckets.set(t.marketId, b) }
    if (t.side === 'buy') b.buy += n
    else b.sell += n
    b.lastPrice = t.price
  }

  const out: Signal[] = []
  for (const [marketId, b] of buckets) {
    const total = b.buy + b.sell
    if (total < WHALE_MIN_TOTAL_USD) continue
    const skew = (b.buy - b.sell) / total
    if (Math.abs(skew) < WHALE_MIN_SKEW) continue

    const direction = skew > 0 ? 'long' : 'short'
    const sizeScore = Math.min(1, total / 1_000_000)
    const skewScore = (Math.abs(skew) - WHALE_MIN_SKEW) / (1 - WHALE_MIN_SKEW)
    const confidence = sizeScore * 0.5 + Math.min(1, skewScore) * 0.5

    out.push({
      id: `whale:${marketId}:${Math.floor(now / 30_000)}`,  // dedup per 30s per market
      source: 'whale',
      venue,
      marketId,
      direction,
      confidence,
      triggeredAt: now,
      expiresAt: now + 5 * 60_000,
      title: `Whale ${direction === 'long' ? 'buy' : 'sell'} flow`,
      detail: `${marketId}: $${(total / 1000).toFixed(0)}k notional in 60s, ${
        Math.round(skew * 100)
      }% ${direction} skew`,
      suggestedPrice: b.lastPrice || undefined,
    })
  }
  return out
}

// ─── Source 4: RSI overbought/oversold cross ────────────────────────
//
// Wilder's smoothed RSI on the closes. Fires the moment RSI crosses
// into an extreme zone (above 70 = overbought = short bias; below 30
// = oversold = long bias). Cross-on-entry only — does not re-fire
// while the indicator stays in the zone.

const RSI_PERIOD = 14
const RSI_OVERBOUGHT = 70
const RSI_OVERSOLD = 30
const RSI_TTL = 30 * 60 * 1000

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function rsiSeries(closes: number[], period: number = RSI_PERIOD): number[] {
  if (closes.length < period + 1) return []
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) avgGain += change
    else avgLoss -= change
  }
  avgGain /= period
  avgLoss /= period

  const out: number[] = [rsiFrom(avgGain, avgLoss)]
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out.push(rsiFrom(avgGain, avgLoss))
  }
  return out
}

export function rsiSignals(
  venue: VenueId,
  marketId: string,
  candles: CandleData[],
  now: number = Date.now(),
): Signal[] {
  if (candles.length < RSI_PERIOD + 2) return []
  const series = rsiSeries(candles.map(c => c.close))
  if (series.length < 2) return []

  const last = series[series.length - 1]
  const prev = series[series.length - 2]

  const enteredOversold = prev > RSI_OVERSOLD && last <= RSI_OVERSOLD
  const enteredOverbought = prev < RSI_OVERBOUGHT && last >= RSI_OVERBOUGHT
  if (!enteredOversold && !enteredOverbought) return []

  const direction = enteredOversold ? 'long' : 'short'
  const lastBar = candles[candles.length - 1]

  // Confidence: 0.4 baseline for the fresh cross + scaled depth.
  // Scale to RSI 0/100 so a barely-touched threshold is mid-confidence
  // and a deep extreme caps at 1.0.
  const depth = direction === 'long'
    ? (RSI_OVERSOLD - last) / RSI_OVERSOLD
    : (last - RSI_OVERBOUGHT) / (100 - RSI_OVERBOUGHT)
  const confidence = Math.min(1, 0.4 + Math.max(0, depth) * 0.6)

  return [{
    id: `rsi:${marketId}:${lastBar.time}`,
    source: 'rsi',
    venue,
    marketId,
    direction,
    confidence,
    triggeredAt: now,
    expiresAt: now + RSI_TTL,
    title: `RSI ${enteredOversold ? 'oversold' : 'overbought'}`,
    detail: `${marketId} RSI(14) ${
      enteredOversold ? 'crossed below ' + RSI_OVERSOLD : 'crossed above ' + RSI_OVERBOUGHT
    } — currently ${last.toFixed(1)}`,
    suggestedPrice: lastBar.close,
  }]
}

// ─── Source 5: Volatility spike on the active market's candles ──────
//
// Compares the most recent bar's high-low range to the rolling mean of
// the prior LOOKBACK bars. Fires when the range exceeds MULTIPLE x the
// baseline. Direction inferred from the bar's body: bullish close = long
// (breakout up), bearish close = short (breakdown).

const VOL_LOOKBACK = 20
const VOL_MULTIPLE = 3
const VOL_TTL = 15 * 60 * 1000

export function volatilitySignals(
  venue: VenueId,
  marketId: string,
  candles: CandleData[],
  now: number = Date.now(),
): Signal[] {
  if (candles.length < VOL_LOOKBACK + 1) return []

  const last = candles[candles.length - 1]
  const lastRange = last.high - last.low
  if (lastRange <= 0) return []

  // Rolling mean range over the prior LOOKBACK bars (excluding current)
  let sum = 0
  for (let i = candles.length - 1 - VOL_LOOKBACK; i < candles.length - 1; i++) {
    const c = candles[i]
    sum += c.high - c.low
  }
  const avgRange = sum / VOL_LOOKBACK
  if (avgRange <= 0) return []

  const multiple = lastRange / avgRange
  if (multiple < VOL_MULTIPLE) return []

  // Body direction — bullish close above open = long-side breakout
  const bullish = last.close >= last.open
  const direction = bullish ? 'long' : 'short'

  // Confidence: scale extra multiples above threshold, cap at 1
  const confidence = Math.min(1, (multiple - VOL_MULTIPLE) / VOL_MULTIPLE)

  return [{
    id: `volatility:${marketId}:${last.time}`,
    source: 'volatility',
    venue,
    marketId,
    direction,
    confidence,
    triggeredAt: now,
    expiresAt: now + VOL_TTL,
    title: `${multiple.toFixed(1)}x volatility spike`,
    detail: `${marketId} last bar range ${multiple.toFixed(1)}x its 20-bar avg — ${
      bullish ? 'upside' : 'downside'
    } breakout`,
    suggestedPrice: last.close,
  }]
}

// ─── Synthesizer: confluence ─────────────────────────────────────────
//
// When ≥2 distinct sources fire on the same market in the same
// direction, emit a top-priority synthesis signal. Raw signals stay
// in the feed below — the confluence card explains *why* they align.

const CONFLUENCE_TTL = 30 * 60 * 1000

export function confluenceSignals(base: Signal[], now: number = Date.now()): Signal[] {
  // Group by `${marketId}:${direction}`
  const groups = new Map<string, Signal[]>()
  for (const s of base) {
    if (s.source === 'confluence') continue   // never fold in synthesized signals
    const key = `${s.marketId}:${s.direction}`
    const arr = groups.get(key) ?? []
    arr.push(s)
    groups.set(key, arr)
  }

  const out: Signal[] = []
  for (const [key, group] of groups) {
    const uniqueSources = new Set(group.map(s => s.source))
    if (uniqueSources.size < 2) continue

    const [marketId, direction] = key.split(':') as [string, 'long' | 'short']
    const venue = group[0].venue
    const sourceCount = uniqueSources.size
    const maxConfidence = Math.max(...group.map(s => s.confidence))
    // Confidence: at least 0.7 for 2 sources, 0.85 for 3, 0.95 for 4+,
    // bumped up to maxConfidence if any single contributor was already
    // higher.
    const baseFromCount = Math.min(0.95, 0.55 + sourceCount * 0.15)
    const confidence = Math.max(maxConfidence, baseFromCount)
    const sourceList = Array.from(uniqueSources).sort().join(' + ')

    out.push({
      id: `confluence:${marketId}:${direction}:${Math.floor(now / 60_000)}`,
      source: 'confluence',
      venue,
      marketId,
      direction,
      confidence,
      triggeredAt: now,
      expiresAt: now + CONFLUENCE_TTL,
      title: `${sourceCount}-source confluence`,
      detail: `${marketId} ${direction} aligned across ${sourceList}`,
      suggestedPrice: group[0].suggestedPrice,
    })
  }
  return out
}

// ─── Aggregator ───────────────────────────────────────────────────────

export interface ComputeInputs {
  venue: VenueId
  markets: Market[]
  tickers: Map<string, Ticker>
  selectedMarketId: string
  /** Live candles for the actively-charted market — drives TA on the
   *  selected market even before the multi-market fetch resolves. */
  candles: CandleData[]
  /** Top-N market candles fetched in the background for cross-market
   *  TA scanning. May be empty during the first ~1s after a venue
   *  switch while the fetch runs. */
  candlesByMarket: Map<string, CandleData[]>
  largeTrades: PublicTrade[]
}

export function computeSignals(inputs: ComputeInputs, now: number = Date.now()): Signal[] {
  const { venue, markets, tickers, selectedMarketId, candles, candlesByMarket, largeTrades } = inputs
  const out: Signal[] = []

  out.push(...fundingSignals(venue, markets, tickers, now))
  out.push(...whaleFlowSignals(venue, largeTrades, now))

  // Run TA across every market in the multi-market cache.
  for (const [marketId, c] of candlesByMarket) {
    out.push(...crossoverSignals(venue, marketId, c, 9, 21, now))
    out.push(...rsiSignals(venue, marketId, c, now))
    out.push(...volatilitySignals(venue, marketId, c, now))
  }

  // Also run TA on the live store candles for the selected market —
  // catches TA changes between background-refresh ticks and works
  // before the first multi-market fetch completes.
  if (!candlesByMarket.has(selectedMarketId)) {
    out.push(...crossoverSignals(venue, selectedMarketId, candles, 9, 21, now))
    out.push(...rsiSignals(venue, selectedMarketId, candles, now))
    out.push(...volatilitySignals(venue, selectedMarketId, candles, now))
  }

  // Dedup by id (same signal may surface from both code paths)
  const byId = new Map<string, Signal>()
  for (const s of out) byId.set(s.id, s)
  const base = Array.from(byId.values())

  // Synthesize confluence signals on top of the deduped base, then
  // sort the union — confluence signals tend to land at the top
  // because of their score floor.
  const synthesized = confluenceSignals(base, now)
  return [...synthesized, ...base].sort((a, b) => b.confidence - a.confidence)
}
