/**
 * signalChartMarkers — map live signals to `@tradecanvas/chart` drawings.
 *
 * Renders an arrow at each signal's (triggeredAt, suggestedPrice) for
 * the selected market. Long signals get a green arrow, short signals red.
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

export function isSignalDrawing(d: { id: string }): boolean {
  return typeof d.id === 'string' && d.id.startsWith(PREFIX)
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
    const color = isLong ? '#22c55e' : '#ef4444'
    // The arrow tool uses two anchors (tail → head). Place the tail a
    // little above (long) or below (short) the suggested price so the
    // arrow points AT the trigger price.
    const offset = s.suggestedPrice * 0.005
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
        lineWidth: 2,
        lineStyle: 'solid',
        fillColor: color,
        fillOpacity: 0.6,
      },
      visible: true,
      locked: true,
      meta: {
        source: s.source,
        confidence: s.confidence,
        title: s.title,
      },
    })
  }
  return out
}
