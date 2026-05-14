/**
 * SourceTrendSparkline — per-source edge accumulation line.
 *
 * For each resolved signal of a given source (in chronological order),
 * we accumulate +0.5 on a hit and -0.5 on a miss. The resulting line
 * tilts UP when the source has edge (more hits than misses) and DOWN
 * when it doesn't. Same visual grammar as the equity curve on the
 * portfolio page, just at a per-source granularity.
 *
 * Powered by @tradecanvas/chart 0.6 SparklineChart. Tiny inline; lives
 * inside the "By source" table on /proof.
 */

import { useEffect, useMemo, useRef } from 'react'
import { SparklineChart, DARK_TERMINAL } from '@tradecanvas/chart'
import type { ResolvedEntry } from '../store/signalPerformanceStore'
import type { SignalSource } from '../signals/types'

const MIN_POINTS = 2

interface Props {
  source: SignalSource
  resolved: ResolvedEntry[]
  width?: number
  height?: number
}

export function SourceTrendSparkline({ source, resolved, width = 84, height = 22 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<SparklineChart | null>(null)

  const series: number[] = useMemo(() => {
    const filtered = resolved
      .filter(r => r.source === source)
      .sort((a, b) => a.closedAt - b.closedAt)
    if (filtered.length < MIN_POINTS) return []
    let edge = 0
    const out: number[] = [edge]
    for (const r of filtered) {
      edge += r.hit ? 0.5 : -0.5
      out.push(edge)
    }
    return out
  }, [source, resolved])

  const final = series.length > 0 ? series[series.length - 1] : 0
  const positive = final >= 0
  const hasSeries = series.length >= MIN_POINTS

  useEffect(() => {
    if (!containerRef.current || !hasSeries) return
    const chart = new SparklineChart(containerRef.current, {
      data: series,
      mode: 'area',
      color: positive ? '#26d984' : '#ff5d6d',
      fillColor: positive ? 'rgba(38,217,132,0.18)' : 'rgba(255,93,109,0.18)',
      lineWidth: 1.2,
      showLastPoint: true,
      lastPointColor: positive ? '#26d984' : '#ff5d6d',
      theme: DARK_TERMINAL,
    })
    chartRef.current = chart
    return () => { chart.destroy(); chartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSeries])

  useEffect(() => {
    if (hasSeries) {
      chartRef.current?.update(series)
      chartRef.current?.setOptions({
        color: positive ? '#26d984' : '#ff5d6d',
        fillColor: positive ? 'rgba(38,217,132,0.18)' : 'rgba(255,93,109,0.18)',
        lastPointColor: positive ? '#26d984' : '#ff5d6d',
      })
    }
  }, [series, positive, hasSeries])

  if (!hasSeries) {
    return <span className="inline-block text-[10px] text-text-muted">—</span>
  }

  return (
    <div
      ref={containerRef}
      title={`Edge accumulation over ${series.length - 1} resolved ${source} signals (${positive ? 'positive' : 'negative'} slope)`}
      style={{ width, height, display: 'inline-block' }}
    />
  )
}
