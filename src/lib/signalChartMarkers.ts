/**
 * signalChartMarkers — map live signals to `@tradecanvas/chart` drawings.
 *
 * Renders an up/down arrow at each signal's (triggeredAt, suggestedPrice)
 * for the selected market. The time anchor encodes WHEN the signal fired
 * — a horizontal line couldn't communicate that. Long signals get a
 * green arrow pointing up to the trigger price; short signals get a red
 * arrow pointing down to it.
 *
 * IDs are prefixed `signal:` so the caller can merge with user-drawn
 * shapes (preserve everything that DOESN'T start with `signal:`, then
 * append our markers, then call chart.setDrawings(merged)).
 */

import type { Signal } from '../signals/types'

interface DrawingAnchor { time: number; price: number }
interface DrawingStyle {
  color: string
  lineWidth: number
  lineStyle: 'solid' | 'dashed' | 'dotted'
  fillColor?: string
  fillOpacity?: number
  fontSize?: number
  text?: string
}
export interface SignalDrawing {
  id: string
  type: 'arrow'
  anchors: DrawingAnchor[]
  style: DrawingStyle
  visible: boolean
  locked: boolean
  meta?: Record<string, unknown>
}

const PREFIX = 'signal:'
const RESOLVED_PREFIX = 'resolved:'

export function isSignalDrawing(d: { id: string }): boolean {
  return typeof d.id === 'string'
    && (d.id.startsWith(PREFIX) || d.id.startsWith(RESOLVED_PREFIX))
}

export function buildSignalDrawings(
  signals: Signal[],
  selectedMarketId: string,
): SignalDrawing[] {
  const out: SignalDrawing[] = []
  for (const s of signals) {
    if (s.marketId !== selectedMarketId) continue
    if (s.suggestedPrice == null || !Number.isFinite(s.suggestedPrice)) continue

    const isLong = s.direction === 'long'
    const color = isLong ? '#26d984' : '#ff5d6d'
    // Tail offset 2.5% of price — large enough that the arrow stays
    // visible at any zoom level. Head sits AT the trigger price so the
    // user can read the exact level the signal anchored to. Long: tail
    // BELOW head (arrow points up). Short: tail ABOVE head (points down).
    const offset = s.suggestedPrice * 0.025
    const head: DrawingAnchor = { time: s.triggeredAt, price: s.suggestedPrice }
    const tail: DrawingAnchor = {
      time: s.triggeredAt,
      price: isLong ? s.suggestedPrice - offset : s.suggestedPrice + offset,
    }
    out.push({
      id: `${PREFIX}${s.id}`,
      type: 'arrow',
      anchors: [tail, head],
      style: {
        color,
        lineWidth: 3,
        lineStyle: 'solid',
        fillColor: color,
        fillOpacity: 0.85,
      },
      visible: true,
      locked: true,
      meta: {
        source: s.source,
        confidence: s.confidence,
        title: s.title,
        direction: s.direction,
      },
    })
  }
  return out
}

/**
 * buildResolvedSignalDrawings — historical audit markers.
 *
 * Live signal markers (above) appear at trigger time and disappear
 * as the signal dismisses or rolls off. Resolved markers persist —
 * one per resolved entry in the user's signalPerformanceStore — so
 * users can retrospectively audit "did the signal a week ago
 * actually call the move?"
 *
 * Visual encoding:
 *   - hit  → faded long-tone green
 *   - miss → faded short-tone red
 *   - smaller arrow than live markers (style.lineWidth 2 vs 3)
 *   - locked + non-interactive — purely read-only audit
 *
 * Anchored at (triggeredAt, entryPrice) so the dot sits exactly where
 * the signal claimed the price was when it fired.
 */
export interface ResolvedSignalEntry {
  id: string
  source: string
  marketId: string
  direction: 'long' | 'short'
  entryPrice: number
  closePrice: number
  triggeredAt: number
  closedAt: number
  hit: boolean
}

export function buildResolvedSignalDrawings(
  resolved: ResolvedSignalEntry[],
  selectedMarketId: string,
  limit = 100,
): SignalDrawing[] {
  const out: SignalDrawing[] = []
  const filtered = resolved
    .filter(r => r.marketId === selectedMarketId && Number.isFinite(r.entryPrice))
    .slice(-limit) // most recent N; older signals roll off

  for (const r of filtered) {
    const isLong = r.direction === 'long'
    const color = r.hit
      ? (isLong ? '#26d984' : '#26d984') // both directions: green on hit
      : (isLong ? '#ff5d6d' : '#ff5d6d') // red on miss
    const offset = r.entryPrice * 0.015 // tighter than live markers
    const head: DrawingAnchor = { time: r.triggeredAt, price: r.entryPrice }
    const tail: DrawingAnchor = {
      time: r.triggeredAt,
      price: isLong ? r.entryPrice - offset : r.entryPrice + offset,
    }
    out.push({
      id: `${RESOLVED_PREFIX}${r.id}`,
      type: 'arrow',
      anchors: [tail, head],
      style: {
        color,
        lineWidth: 2,
        lineStyle: 'solid',
        fillColor: color,
        fillOpacity: 0.35, // faded so live signals stand out over resolved
      },
      visible: true,
      locked: true,
      meta: {
        source: r.source,
        hit: r.hit,
        entryPrice: r.entryPrice,
        closePrice: r.closePrice,
        direction: r.direction,
      },
    })
  }
  return out
}
