/**
 * EquityCurve — cumulative realized PnL line.
 *
 * Backed by @tradecanvas/chart 0.6's EquityCurveChart. Drawdown
 * shading + canvas crosshair come for free; we leave them off here
 * for the compact-height sparkline variant. The bigger variant on
 * PerformanceDashboard flips them on.
 *
 * Caller still passes closed BotTrade rows sorted ascending by
 * `closedAt`; we convert to {time, value} EquityPoints on render.
 */

import { useEffect, useMemo, useRef } from 'react'
import { EquityCurveChart, DARK_TERMINAL, type EquityPoint } from '@tradecanvas/chart'
import type { BotTrade } from '../bots/types'

interface EquityCurveProps {
  trades: Array<BotTrade & { closedAt: number; pnlUsd: number }>
  className?: string
  height?: number
}

export function EquityCurve({ trades, className, height = 36 }: EquityCurveProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EquityCurveChart | null>(null)

  const points: EquityPoint[] = useMemo(() => {
    if (trades.length === 0) return []
    let cum = 0
    const out: EquityPoint[] = []
    // Seed at first-trade-time minus 1s with zero so the line starts
    // from the origin rather than the first profitable trade.
    out.push({ time: trades[0].closedAt - 1000, value: 0 })
    for (const t of trades) {
      cum += t.pnlUsd
      out.push({ time: t.closedAt, value: cum })
    }
    return out
  }, [trades])

  useEffect(() => {
    if (!containerRef.current) return
    const chart = new EquityCurveChart(containerRef.current, {
      data: points,
      drawdown: false,
      crosshair: false,
      fillArea: true,
      theme: DARK_TERMINAL,
    })
    chartRef.current = chart
    return () => {
      chart.destroy()
      chartRef.current = null
    }
    // Intentional: chart instance is created once, fed via update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.update(points)
  }, [points])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height }}
    />
  )
}
