/**
 * BotLeaderboardPage — ranks all configured bots by performance.
 *
 * Pure read-only surface. Sort columns: total PnL (default), win-rate
 * (gated to bots with >=3 closed trades to avoid noise), trade count.
 * Each row shows a tiny equity-curve sparkline so visual scanning is
 * fast even without sorting.
 *
 * The Compare modal on /bots is for 1-3 bot deep overlay; this page is
 * the bird's-eye view across all bots.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Trophy, ArrowDown, ArrowUp } from 'lucide-react'
import { SparklineChart, DARK_TERMINAL } from '@tradecanvas/chart'
import { useBotStore } from '../store/botStore'
import { useDocumentMeta } from '../lib/documentMeta'
import { EmptyState } from '../components/ui/EmptyState'
import { cn } from '../lib/format'
import type { BotTrade } from '../bots/types'

type SortKey = 'pnl' | 'winRate' | 'trades'

interface Row {
  id: string
  name: string
  enabled: boolean
  mode: 'paper' | 'live'
  totalPnl: number
  realizedPnl: number
  wins: number
  losses: number
  closed: number
  open: number
  winRate: number
  series: number[]
}

export function BotLeaderboardPage() {
  useDocumentMeta({
    title: 'TradingDek — Bot leaderboard',
    description: 'Ranked performance across every configured bot.',
    canonical: '/bots/leaderboard',
  })

  const bots = useBotStore(s => s.bots)
  const tradesAll = useBotStore(s => s.trades)
  const [sortKey, setSortKey] = useState<SortKey>('pnl')

  const rows = useMemo<Row[]>(() => {
    return bots.map(b => {
      const myTrades = tradesAll.filter(t => t.botId === b.id)
      const closed = myTrades.filter(t => t.closedAt !== undefined && t.pnlUsd !== undefined)
      const open = myTrades.length - closed.length

      let wins = 0
      let losses = 0
      let realizedPnl = 0
      for (const t of closed) {
        realizedPnl += t.pnlUsd ?? 0
        if ((t.pnlUsd ?? 0) >= 0) wins++
        else losses++
      }

      const series = equitySeries(closed)
      const winRate = closed.length > 0 ? wins / closed.length : 0

      return {
        id: b.id,
        name: b.name,
        enabled: b.enabled,
        mode: b.mode,
        totalPnl: realizedPnl,
        realizedPnl,
        wins,
        losses,
        closed: closed.length,
        open,
        winRate,
        series,
      }
    })
  }, [bots, tradesAll])

  const sorted = useMemo(() => {
    const arr = [...rows]
    if (sortKey === 'pnl') arr.sort((a, b) => b.totalPnl - a.totalPnl)
    else if (sortKey === 'trades') arr.sort((a, b) => b.closed - a.closed)
    else {
      // Win-rate: bots with <3 closed trades sink to the bottom (insufficient sample).
      const score = (r: Row) => (r.closed >= 3 ? r.winRate : -1 + r.closed / 10)
      arr.sort((a, b) => score(b) - score(a))
    }
    return arr
  }, [rows, sortKey])

  const aggregate = useMemo(() => {
    let pnl = 0
    let n = 0
    let wins = 0
    for (const r of rows) {
      pnl += r.totalPnl
      n += r.closed
      wins += r.wins
    }
    return { pnl, trades: n, wins, winRate: n > 0 ? wins / n : 0 }
  }, [rows])

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-6">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Bot leaderboard
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Ranked across {rows.length} bot{rows.length === 1 ? '' : 's'}. Realized PnL only.
            </p>
          </div>
          <Link
            to="/bots"
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-accent/40 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Bot manager
          </Link>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total realized" value={fmtPnl(aggregate.pnl)} tone={aggregate.pnl > 0 ? 'long' : aggregate.pnl < 0 ? 'short' : 'neutral'} />
          <Stat label="Closed trades" value={aggregate.trades.toLocaleString()} />
          <Stat label="Wins" value={aggregate.wins.toLocaleString()} tone="long" />
          <Stat label="Win rate" value={`${(aggregate.winRate * 100).toFixed(1)}%`} />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            density="spacious"
            title="No bots configured yet"
            description="Set up your first bot to start filling this leaderboard."
            action={
              <Link
                to="/bots"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                Create a bot
              </Link>
            }
          />
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-panel/60">
                <tr>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">#</th>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Bot</th>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Mode</th>
                  <SortableTh active={sortKey === 'pnl'} onClick={() => setSortKey('pnl')} align="right">
                    Realized PnL
                  </SortableTh>
                  <SortableTh active={sortKey === 'winRate'} onClick={() => setSortKey('winRate')} align="right">
                    Win-rate
                  </SortableTh>
                  <SortableTh active={sortKey === 'trades'} onClick={() => setSortKey('trades')} align="right">
                    Trades
                  </SortableTh>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider w-28">Equity</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.id} className="border-t border-border hover:bg-panel/30">
                    <td className="px-3 py-2 font-mono text-text-muted">
                      {i === 0 ? <span className="text-amber-400">★</span> : i + 1}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle', r.enabled ? 'bg-long' : 'bg-text-muted')} />
                      {r.name}
                      {r.open > 0 && (
                        <span className="ml-2 text-[10px] text-text-muted">({r.open} open)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono uppercase">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px]',
                        r.mode === 'live' ? 'bg-amber-400/20 text-amber-300' : 'bg-text-muted/15 text-text-muted'
                      )}>
                        {r.mode}
                      </span>
                    </td>
                    <td className={cn(
                      'px-3 py-2 text-right font-mono tabular-nums',
                      r.totalPnl > 0 ? 'text-long' : r.totalPnl < 0 ? 'text-short' : ''
                    )}>{fmtPnl(r.totalPnl)}</td>
                    <td className={cn(
                      'px-3 py-2 text-right font-mono tabular-nums',
                      r.closed < 3 ? 'text-text-muted' : r.winRate >= 0.55 ? 'text-long' : r.winRate < 0.45 ? 'text-short' : ''
                    )}>
                      {r.closed < 3 ? '—' : `${(r.winRate * 100).toFixed(0)}%`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.closed}</td>
                    <td className="px-3 py-2 text-right">
                      <EquitySpark series={r.series} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-[10px] text-text-muted font-mono">
          Win-rate dashes for bots with &lt;3 closed trades — too few to be meaningful.
        </div>
      </section>
    </div>
  )
}

function equitySeries(closed: BotTrade[]): number[] {
  const sorted = [...closed].sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))
  if (sorted.length === 0) return []
  const out: number[] = [0]
  let cum = 0
  for (const t of sorted) {
    cum += t.pnlUsd ?? 0
    out.push(cum)
  }
  return out
}

function EquitySpark({ series }: { series: number[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<SparklineChart | null>(null)
  const hasSeries = series.length >= 2
  const final = series[series.length - 1] ?? 0
  const positive = final >= 0

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
    return <span className="text-[10px] text-text-muted">—</span>
  }
  return (
    <div
      ref={containerRef}
      style={{ width: 100, height: 24, display: 'inline-block' }}
      title={`Final equity: ${fmtPnl(final)}`}
    />
  )
}

function SortableTh({ children, active, onClick, align = 'left' }: { children: React.ReactNode; active: boolean; onClick: () => void; align?: 'left' | 'right' }) {
  return (
    <th className={cn('px-3 py-2 font-mono uppercase tracking-wider', align === 'right' ? 'text-right' : 'text-left')}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer',
          active ? 'text-text-primary' : 'text-text-muted'
        )}
      >
        {children}
        {active && <ArrowDown className="w-3 h-3" />}
        {!active && <ArrowUp className="w-3 h-3 opacity-30" />}
      </button>
    </th>
  )
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'long' | 'short' | 'neutral' }) {
  const toneCls = tone === 'long' ? 'text-long' : tone === 'short' ? 'text-short' : 'text-text-primary'
  return (
    <div className="rounded-lg border border-border bg-panel/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-mono mb-1">{label}</div>
      <div className={cn('text-xl font-mono font-semibold tabular-nums', toneCls)}>{value}</div>
    </div>
  )
}

function fmtPnl(usd: number): string {
  const sign = usd > 0 ? '+' : usd < 0 ? '-' : ''
  return `${sign}$${Math.abs(usd).toFixed(2)}`
}
