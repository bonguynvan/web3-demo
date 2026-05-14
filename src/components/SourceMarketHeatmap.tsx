/**
 * SourceMarketHeatmap — "which signal sources work on which markets"
 * answered as a single visual.
 *
 * Each cell represents a (source, marketId) pair from the user's
 * resolved-signal ledger. Color encodes hit rate (red 0% → green 100%
 * at 50% pivot); cell size encodes sample count so reliable
 * combinations dominate the view. Tiny samples shrink and become
 * easy to ignore.
 *
 * Pure analytics — answers the strategy question "which combinations
 * should I run a bot on?" without touching execution. Aligned with
 * the saved auto-bot-philosophy memory.
 */

import { useEffect, useMemo, useRef } from 'react'
import { HeatmapChart, DARK_TERMINAL, type HeatmapCell } from '@tradecanvas/chart'
import type { ResolvedEntry } from '../store/signalPerformanceStore'

const MIN_SAMPLES = 3 // hide combos under this; sample size is meaningless

interface Props {
  resolved: ResolvedEntry[]
  height?: number
}

export function SourceMarketHeatmap({ resolved, height = 240 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HeatmapChart | null>(null)

  const cells: HeatmapCell[] = useMemo(() => {
    if (resolved.length === 0) return []
    const buckets = new Map<string, { hits: number; total: number; source: string; marketId: string }>()
    for (const r of resolved) {
      const key = `${r.source}@${r.marketId}`
      const b = buckets.get(key) ?? { hits: 0, total: 0, source: r.source, marketId: r.marketId }
      b.total += 1
      if (r.hit) b.hits += 1
      buckets.set(key, b)
    }
    const out: HeatmapCell[] = []
    for (const [key, b] of buckets.entries()) {
      if (b.total < MIN_SAMPLES) continue
      const hitRate = b.hits / b.total
      out.push({
        id: key,
        label: `${b.source}\n${b.marketId}`,
        // Center at 0 so 50% hit rate = neutral, 100% = +100, 0% = -100.
        value: (hitRate - 0.5) * 200,
        weight: b.total,
        group: b.source,
        meta: { hits: b.hits, total: b.total, hitRate },
      })
    }
    out.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    return out
  }, [resolved])

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
        min: -100,
        max: 100,
      },
      labelFormat: (cell) => {
        const meta = cell.meta as { hits: number; total: number; hitRate: number } | undefined
        if (!meta) return cell.label
        return `${cell.label}\n${Math.round(meta.hitRate * 100)}% · ${meta.total}t`
      },
    })
    chartRef.current = chart
    return () => { chart.destroy(); chartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.setOptions({ data: cells })
  }, [cells])

  if (cells.length === 0) {
    return (
      <div className="h-[140px] flex items-center justify-center text-xs text-text-muted rounded-lg border border-dashed border-border">
        Heatmap appears once any (source × market) combo has{' '}
        {MIN_SAMPLES}+ resolved trades.
      </div>
    )
  }

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
