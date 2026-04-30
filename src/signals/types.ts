/**
 * Canonical signal type — what every signal source emits and what
 * the UI renders. Derived from raw venue data; not adapter-shape.
 *
 * Signals are stateless snapshots. The compute layer re-derives them
 * on every input change; the UI filters out anything past its
 * expiresAt. No persistence in S1 — feed is "what's live right now".
 */

import type { VenueId } from '../adapters/types'

export type SignalSource =
  | 'funding'        // funding-rate extremes on a perp market
  | 'crossover'      // moving-average crossover from candles
  | 'rsi'            // RSI overbought/oversold extreme cross
  | 'volatility'     // outsized bar range vs rolling baseline
  | 'liquidation'    // forced position liquidation observed
  | 'news'           // market-moving news headline
  | 'whale'          // large wallet position open/close

export type SignalDirection = 'long' | 'short'

export interface Signal {
  /** Stable id — sources derive from `${source}:${marketId}:${triggerKey}` so
   *  identical signals dedup across recompute cycles. */
  id: string
  source: SignalSource
  venue: VenueId
  marketId: string
  direction: SignalDirection
  /** Source-defined 0..1 score. UI sorts by this descending. */
  confidence: number
  triggeredAt: number
  expiresAt: number
  /** Short title, e.g. "Funding spike". */
  title: string
  /** One-line explanation for the trader. */
  detail: string
  /** Optional pre-fill for the order form on click. */
  suggestedPrice?: number
}

/** Filter out signals past their expiresAt. */
export function isLive(signal: Signal, now: number = Date.now()): boolean {
  return signal.expiresAt > now
}
