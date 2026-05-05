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
