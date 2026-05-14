/**
 * SignalQualityGauge — at-a-glance confidence indicator for the
 * currently visible signal feed.
 *
 * Computes the average `confidence` across the supplied Signal[]
 * (typically the filtered, non-locked subset already rendered) and
 * displays it as a 0-100 gauge with red / neutral / green zones.
 *
 * Renders nothing if the feed is empty. Powered by
 * @tradecanvas/chart 0.6 GaugeChart.
 */

import { useEffect, useMemo, useRef } from 'react'
import { GaugeChart, DARK_TERMINAL } from '@tradecanvas/chart'
import type { Signal } from '../signals/types'

interface Props {
  signals: Signal[]
  size?: number
}

export function SignalQualityGauge({ signals, size = 90 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<GaugeChart | null>(null)

  const score = useMemo(() => {
    if (signals.length === 0) return null
    const sum = signals.reduce((s, x) => s + x.confidence, 0)
    return Math.round((sum / signals.length) * 100)
  }, [signals])

  const hasScore = score != null

  useEffect(() => {
    if (!containerRef.current || !hasScore) return
    const chart = new GaugeChart(containerRef.current, {
      value: score ?? 0,
      min: 0,
      max: 100,
      zones: [
        { from: 0,  to: 40, color: '#ff5d6d' },
        { from: 40, to: 70, color: '#a0a4ab' },
        { from: 70, to: 100, color: '#26d984' },
      ],
      showValue: true,
      label: 'Quality',
      thickness: 8,
      valueFormat: (v) => Math.round(v).toString(),
      theme: DARK_TERMINAL,
    })
    chartRef.current = chart
    return () => { chart.destroy(); chartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasScore])

  useEffect(() => {
    if (score != null) chartRef.current?.setValue(score)
  }, [score])

  if (!hasScore) return null

  return (
    <div
      title={`Average confidence across ${signals.length} visible signal${signals.length === 1 ? '' : 's'}`}
      ref={containerRef}
      style={{ width: size, height: size * 0.7 }}
    />
  )
}
