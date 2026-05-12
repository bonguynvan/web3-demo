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

import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import type { BotTrade } from '../bots/types'
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

function EquityChart({ trades }: { trades: ClosedTrade[] }) {
  const W = 600
  const H = 140
  const PAD_L = 4
  const PAD_R = 4
  const PAD_T = 8
  const PAD_B = 18

  const series = trades.reduce<{ t: number; y: number }[]>((acc, tr) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].y : 0
    acc.push({ t: tr.closedAt, y: prev + tr.pnlUsd })
    return acc
  }, [])

  const tMin = series[0].t
  const tMax = series[series.length - 1].t
  const tSpan = tMax - tMin || 1
  const ys = series.map(p => p.y)
  const yMin = Math.min(0, ...ys)
  const yMax = Math.max(0, ...ys)
  const yPad = (yMax - yMin) * 0.1 || 1
  const yLo = yMin - yPad
  const yHi = yMax + yPad

  const project = (t: number, y: number) => ({
    px: PAD_L + ((t - tMin) / tSpan) * (W - PAD_L - PAD_R),
    py: PAD_T + (1 - (y - yLo) / (yHi - yLo)) * (H - PAD_T - PAD_B),
  })

  const points = series.map(p => {
    const { px, py } = project(p.t, p.y)
    return `${px.toFixed(2)},${py.toFixed(2)}`
  })

  const zeroY = project(tMin, 0).py
  const finalY = ys[ys.length - 1]
  const positive = finalY >= 0
  const stroke = positive ? '#22c55e' : '#ef4444'
  const fillRgba = positive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'

  const areaPath = `M ${PAD_L},${zeroY} L ${points.join(' ')} L ${W - PAD_R},${zeroY} Z`

  const fmtTick = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <div className="w-full">
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Cumulative realized PnL over time"
      >
        <line
          x1={PAD_L}
          y1={zeroY}
          x2={W - PAD_R}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeDasharray="3 3"
        />
        <path d={areaPath} fill={fillRgba} />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <text x={PAD_L} y={H - 4} fontSize="9" fill="currentColor" opacity={0.5}>
          {fmtTick(tMin)}
        </text>
        <text x={W - PAD_R} y={H - 4} fontSize="9" fill="currentColor" opacity={0.5} textAnchor="end">
          {fmtTick(tMax)}
        </text>
      </svg>
    </div>
  )
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
