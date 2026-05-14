/**
 * PerformanceDashboard — time-anchored equity curve plus the rollups a
 * trader actually wants to see at a glance: 7d / 30d / all-time PnL,
 * win rate, profit factor, expectancy, max drawdown, average win, and
 * average loss. Pure presentational — caller passes the closed-trade
 * slice (already filtered + sorted ascending by `closedAt`).
 *
 * Renders nothing until 2+ trades have closed so the chart isn't a
 * single floating dot. Smaller helpers (Stat, MiniLegend) stay local
 * to avoid leaking single-use atoms into the UI library.
 */

import { useEffect, useMemo, useRef } from 'react'
import { TrendingUp } from 'lucide-react'
import { EquityCurveChart, DARK_TERMINAL, type EquityPoint } from '@tradecanvas/chart'
import type { BotTrade } from '../bots/types'
import { PnlAttributionWaterfall } from './PnlAttributionWaterfall'
import { cn } from '../lib/format'

type ClosedTrade = BotTrade & { closedAt: number; pnlUsd: number }

interface PerformanceDashboardProps {
  trades: ClosedTrade[]
}

const DAY_MS = 86_400_000

export function PerformanceDashboard({ trades }: PerformanceDashboardProps) {
  const metrics = useMemo(() => computeMetrics(trades), [trades])

  if (trades.length < 2) return null

  return (
    <section className="rounded-lg border border-border bg-panel/40 p-4 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-accent" />
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-mono font-semibold text-text-secondary">
            Performance
          </h2>
          <span className="text-[10px] text-text-muted font-mono">
            · {trades.length} closed
          </span>
        </div>
        <MiniLegend />
      </header>

      <EquityChart trades={trades} />

      {/* Per-market attribution — answers "which markets are actually
          earning?" at a glance. Powered by tradecanvas WaterfallChart. */}
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] font-mono font-semibold text-text-secondary mb-2">
          By market
        </div>
        <PnlAttributionWaterfall trades={trades} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="PnL · 7d" value={fmt(metrics.pnl7d)} tone={tone(metrics.pnl7d)} />
        <Stat label="PnL · 30d" value={fmt(metrics.pnl30d)} tone={tone(metrics.pnl30d)} />
        <Stat label="PnL · all" value={fmt(metrics.pnlAll)} tone={tone(metrics.pnlAll)} />
        <Stat
          label="Max drawdown"
          value={metrics.maxDrawdown > 0 ? `-$${metrics.maxDrawdown.toFixed(2)}` : '—'}
          tone={metrics.maxDrawdown > 0 ? 'short' : 'neutral'}
        />
        <Stat
          label="Win rate"
          value={`${(metrics.winRate * 100).toFixed(0)}%`}
          tone={metrics.winRate >= 0.5 ? 'long' : 'short'}
        />
        <Stat
          label="Profit factor"
          value={metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
          tone={metrics.profitFactor >= 1 ? 'long' : 'short'}
        />
        <Stat label="Avg win" value={fmt(metrics.avgWin)} tone="long" />
        <Stat label="Avg loss" value={fmt(-metrics.avgLoss)} tone="short" />
      </div>
    </section>
  )
}

interface Metrics {
  pnl7d: number
  pnl30d: number
  pnlAll: number
  winRate: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  maxDrawdown: number
}

function computeMetrics(trades: ClosedTrade[]): Metrics {
  const now = Date.now()
  let pnl7d = 0
  let pnl30d = 0
  let pnlAll = 0
  let wins = 0
  let grossWin = 0
  let grossLoss = 0
  for (const t of trades) {
    const age = now - t.closedAt
    pnlAll += t.pnlUsd
    if (age <= 7 * DAY_MS) pnl7d += t.pnlUsd
    if (age <= 30 * DAY_MS) pnl30d += t.pnlUsd
    if (t.pnlUsd > 0) {
      wins += 1
      grossWin += t.pnlUsd
    } else if (t.pnlUsd < 0) {
      grossLoss += -t.pnlUsd
    }
  }
  const losses = trades.length - wins
  let cum = 0
  let peak = 0
  let maxDrawdown = 0
  for (const t of trades) {
    cum += t.pnlUsd
    if (cum > peak) peak = cum
    const dd = peak - cum
    if (dd > maxDrawdown) maxDrawdown = dd
  }
  return {
    pnl7d,
    pnl30d,
    pnlAll,
    winRate: trades.length > 0 ? wins / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgWin: wins > 0 ? grossWin / wins : 0,
    avgLoss: losses > 0 ? grossLoss / losses : 0,
    maxDrawdown,
  }
}

/**
 * EquityChart — full-width cumulative PnL with drawdown shading.
 *
 * Powered by @tradecanvas/chart's EquityCurveChart. Drawdown shading
 * is on for the dashboard variant so the user can see at a glance
 * where each peak-to-trough phase happened. Crosshair lets them
 * hover any bar to read the exact dollar amount.
 */
function EquityChart({ trades }: { trades: ClosedTrade[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EquityCurveChart | null>(null)
  const HEIGHT = 160

  const points: EquityPoint[] = useMemo(() => {
    if (trades.length === 0) return []
    let cum = 0
    const out: EquityPoint[] = [{ time: trades[0].closedAt - 1000, value: 0 }]
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
      drawdown: true,
      crosshair: true,
      fillArea: true,
      theme: DARK_TERMINAL,
      timeFormat: (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      valueFormat: (v) => `${v >= 0 ? '+' : ''}$${v.toFixed(2)}`,
    })
    chartRef.current = chart
    return () => { chart.destroy(); chartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.update(points)
  }, [points])

  return <div ref={containerRef} style={{ width: '100%', height: HEIGHT }} />
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'long' | 'short' | 'neutral' }) {
  const toneClass = tone === 'long' ? 'text-long' : tone === 'short' ? 'text-short' : 'text-text-primary'
  return (
    <div className="rounded-md border border-border bg-surface/60 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-mono">{label}</div>
      <div className={cn('text-sm font-mono font-semibold tabular-nums mt-0.5', toneClass)}>{value}</div>
    </div>
  )
}

function MiniLegend() {
  return (
    <div className="text-[10px] font-mono text-text-muted">
      Realised PnL, paper + live combined.
    </div>
  )
}

function fmt(usd: number): string {
  const sign = usd >= 0 ? '+' : '-'
  return `${sign}$${Math.abs(usd).toFixed(2)}`
}

function tone(usd: number): 'long' | 'short' | 'neutral' {
  if (usd > 0) return 'long'
  if (usd < 0) return 'short'
  return 'neutral'
}
