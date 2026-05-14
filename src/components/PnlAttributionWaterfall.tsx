/**
 * PnlAttributionWaterfall — per-market realized-PnL attribution as a
 * waterfall, powered by @tradecanvas/chart 0.6's WaterfallChart.
 *
 * Visualizes: starting balance (zero) → each market's net contribution
 * → ending balance. Markets with material PnL (above NOISE_FLOOR_USD)
 * become individual bars; tiny ones are folded into a single "Other"
 * row so the chart stays readable.
 *
 * Top N by absolute contribution so the most informative bars come
 * first. Negative markets render red, positive green, totals as the
 * accent terminator.
 */

import { useEffect, useMemo, useRef } from 'react'
import { WaterfallChart, DARK_TERMINAL, type WaterfallBar } from '@tradecanvas/chart'
import type { BotTrade } from '../bots/types'

const MAX_MARKETS = 7
const NOISE_FLOOR_USD = 1 // markets contributing < $1 absolute roll into "Other"

interface Props {
  trades: BotTrade[]
  height?: number
}

export function PnlAttributionWaterfall({ trades, height = 180 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<WaterfallChart | null>(null)

  const bars: WaterfallBar[] = useMemo(() => {
    const resolved = trades.filter(t => t.closedAt !== undefined && t.pnlUsd !== undefined)
    if (resolved.length === 0) return []

    const perMarket = new Map<string, number>()
    for (const t of resolved) {
      perMarket.set(t.marketId, (perMarket.get(t.marketId) ?? 0) + (t.pnlUsd ?? 0))
    }

    const sorted = [...perMarket.entries()]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))

    const shown: Array<[string, number]> = []
    let otherSum = 0
    for (const [mkt, val] of sorted) {
      if (Math.abs(val) < NOISE_FLOOR_USD || shown.length >= MAX_MARKETS) {
        otherSum += val
      } else {
        shown.push([mkt, val])
      }
    }

    const total = sorted.reduce((s, [, v]) => s + v, 0)
    const out: WaterfallBar[] = [
      { label: 'Start', value: 0, type: 'total' },
    ]
    for (const [mkt, val] of shown) {
      out.push({ label: mkt, value: val })
    }
    if (Math.abs(otherSum) >= NOISE_FLOOR_USD) {
      out.push({ label: 'Other', value: otherSum })
    }
    out.push({ label: 'End', value: total, type: 'total' })
    return out
  }, [trades])

  useEffect(() => {
    if (!containerRef.current) return
    const chart = new WaterfallChart(containerRef.current, {
      data: bars,
      theme: DARK_TERMINAL,
      showValues: true,
      showDelta: true,
      connectorStyle: 'dashed',
    })
    chartRef.current = chart
    return () => { chart.destroy(); chartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.setOptions({ data: bars })
  }, [bars])

  if (bars.length === 0) {
    return (
      <div className="h-[120px] flex items-center justify-center text-xs text-text-muted">
        No closed trades yet — attribution appears once a bot resolves a trade.
      </div>
    )
  }

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
