/**
 * TimeOfDayHeatmap — "when do my bots make money?"
 *
 * Buckets closed trades by (day-of-week, hour-of-day in UTC) and
 * renders a 7×24 grid via @tradecanvas/chart 0.6 HeatmapChart.
 * Color encodes average realized PnL in that slot; cell size encodes
 * trade count so reliable slots dominate the view.
 *
 * Pure analytics aligned with the auto-bot philosophy memory —
 * answers a strategy question (when to enable/disable a bot) without
 * touching execution.
 */

import { useEffect, useMemo, useRef } from 'react'
import { HeatmapChart, DARK_TERMINAL, type HeatmapCell } from '@tradecanvas/chart'
import type { BotTrade } from '../bots/types'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MIN_TRADES_PER_CELL = 2

interface Props {
  trades: BotTrade[]
  height?: number
}

export function TimeOfDayHeatmap({ trades, height = 240 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HeatmapChart | null>(null)

  const cells: HeatmapCell[] = useMemo(() => {
    const resolved = trades.filter(t => t.closedAt !== undefined && t.pnlUsd !== undefined)
    if (resolved.length === 0) return []

    const buckets = new Map<string, { sumPnl: number; count: number; dow: number; hour: number }>()
    for (const t of resolved) {
      const d = new Date(t.closedAt!)
      const dow = d.getUTCDay()
      const hour = d.getUTCHours()
      const key = `${dow}-${hour}`
      const b = buckets.get(key) ?? { sumPnl: 0, count: 0, dow, hour }
      b.sumPnl += t.pnlUsd ?? 0
      b.count += 1
      buckets.set(key, b)
    }

    const out: HeatmapCell[] = []
    for (const [key, b] of buckets.entries()) {
      if (b.count < MIN_TRADES_PER_CELL) continue
      const avg = b.sumPnl / b.count
      out.push({
        id: key,
        label: `${DAY_NAMES[b.dow]} ${String(b.hour).padStart(2, '0')}:00`,
        value: avg,
        weight: b.count,
        group: DAY_NAMES[b.dow],
        meta: { sumPnl: b.sumPnl, count: b.count, avg },
      })
    }
    out.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    return out
  }, [trades])

  // Auto-scale color extremes so the visualization stays useful
  // whether the user has $5 swings or $500 swings.
  const { vMin, vMax } = useMemo(() => {
    if (cells.length === 0) return { vMin: -1, vMax: 1 }
    const absMax = Math.max(...cells.map(c => Math.abs(c.value)))
    return { vMin: -absMax, vMax: absMax }
  }, [cells])

  useEffect(() => {
    if (!containerRef.current) return
    const chart = new HeatmapChart(containerRef.current, {
      data: cells,
      theme: DARK_TERMINAL,
      weighted: true,
      showLabels: true,
      showValues: false,
      cellPadding: 2,
      cellRadius: 2,
      colorScale: {
        negative: '#ff5d6d',
        zero: '#5e6469',
        positive: '#26d984',
        min: vMin,
        max: vMax,
      },
      labelFormat: (cell) => {
        const meta = cell.meta as { avg: number; count: number } | undefined
        if (!meta) return cell.label
        const sign = meta.avg >= 0 ? '+' : ''
        return `${cell.label}\n${sign}$${meta.avg.toFixed(2)} · ${meta.count}t`
      },
    })
    chartRef.current = chart
    return () => { chart.destroy(); chartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.setOptions({
      data: cells,
      colorScale: {
        negative: '#ff5d6d',
        zero: '#5e6469',
        positive: '#26d984',
        min: vMin,
        max: vMax,
      },
    })
  }, [cells, vMin, vMax])

  if (cells.length === 0) {
    return (
      <div className="h-[140px] flex items-center justify-center text-xs text-text-muted rounded-lg border border-dashed border-border">
        Heatmap appears once any (day, hour) slot has{' '}
        {MIN_TRADES_PER_CELL}+ closed trades.
      </div>
    )
  }

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
