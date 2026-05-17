/**
 * AttributionPage — multi-dimensional edge analysis.
 *
 * Most traders measure overall win-rate and total PnL. Pros want to
 * know WHERE the edge lives: "I'm 65% on funding-squeeze ETH during
 * US session, but 38% on RSI alts on weekends." This page slices the
 * closed-trade ledger by:
 *
 *   - Signal source (funding, crossover, rsi, …)
 *   - Market (BTC-PERP, ETH-PERP, …)
 *   - Hour-of-day (UTC, 0-23)
 *   - Direction (long / short)
 *   - Exit reason (take_profit, stop_loss, tp1_partial, …)
 *
 * Each slice shows: count, win-rate, total PnL, avg trade PnL. Sortable.
 * The narrative is "find your top 3, prune your bottom 3."
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Microscope } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useDocumentMeta } from '../lib/documentMeta'
import { EmptyState } from '../components/ui/EmptyState'
import { cn } from '../lib/format'
import type { BotTrade } from '../bots/types'

type Dimension = 'source' | 'market' | 'hour' | 'direction' | 'exitReason'

interface Slice {
  key: string
  count: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  avgPnl: number
}

const DIMENSION_LABELS: Record<Dimension, string> = {
  source: 'Signal source',
  market: 'Market',
  hour: 'Hour of day (UTC)',
  direction: 'Direction',
  exitReason: 'Exit reason',
}

export function AttributionPage() {
  useDocumentMeta({
    title: 'TradingDek — Attribution',
    description: 'Multi-dimensional edge attribution across closed trades.',
    canonical: '/attribution',
  })

  const allTrades = useBotStore(s => s.trades)
  const closed = useMemo(
    () => allTrades.filter(t => t.closedAt !== undefined && t.pnlUsd !== undefined),
    [allTrades],
  )

  const [dimension, setDimension] = useState<Dimension>('source')
  const [sortBy, setSortBy] = useState<'pnl' | 'win' | 'count'>('pnl')

  const slices = useMemo<Slice[]>(() => {
    const map = new Map<string, BotTrade[]>()
    for (const t of closed) {
      const key = bucket(t, dimension)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    const out: Slice[] = []
    for (const [key, ts] of map) {
      let wins = 0
      let losses = 0
      let total = 0
      for (const t of ts) {
        const pnl = t.pnlUsd ?? 0
        total += pnl
        if (pnl > 0) wins += 1
        else if (pnl < 0) losses += 1
      }
      const decided = wins + losses
      out.push({
        key,
        count: ts.length,
        wins,
        losses,
        winRate: decided > 0 ? wins / decided : 0,
        totalPnl: total,
        avgPnl: ts.length > 0 ? total / ts.length : 0,
      })
    }
    out.sort((a, b) => {
      if (sortBy === 'pnl') return b.totalPnl - a.totalPnl
      if (sortBy === 'win') return b.winRate - a.winRate
      return b.count - a.count
    })
    return out
  }, [closed, dimension, sortBy])

  // For the bar chart: max absolute PnL sets the visual scale (centered on 0).
  const maxAbs = useMemo(
    () => slices.reduce((m, s) => Math.max(m, Math.abs(s.totalPnl)), 0),
    [slices],
  )

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-5">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Microscope className="w-5 h-5 text-accent" />
              Edge attribution
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              {closed.length} closed trade{closed.length === 1 ? '' : 's'} · find your top 3, prune your bottom 3.
            </p>
          </div>
          <Link
            to="/profile"
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-accent/40 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Profile
          </Link>
        </header>

        {closed.length === 0 ? (
          <EmptyState
            density="spacious"
            title="No closed trades yet"
            description="Run some bots and let them close a few positions, then come back to slice the data."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1 font-mono">
                  Slice by
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['source', 'market', 'hour', 'direction', 'exitReason'] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => setDimension(d)}
                      className={cn(
                        'px-2.5 py-1 text-[11px] rounded-md border transition-colors cursor-pointer',
                        dimension === d
                          ? 'bg-accent-dim/40 text-accent border-accent/40'
                          : 'bg-panel text-text-muted border-border hover:text-text-primary',
                      )}
                    >
                      {DIMENSION_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1 font-mono">
                  Sort
                </div>
                <div className="flex gap-1.5">
                  {(['pnl', 'win', 'count'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setSortBy(s)}
                      className={cn(
                        'px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer',
                        sortBy === s
                          ? 'text-accent font-semibold'
                          : 'text-text-muted hover:text-text-primary',
                      )}
                    >
                      {s === 'pnl' ? 'PnL' : s === 'win' ? 'Win %' : 'Count'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {slices.length === 0 ? (
              <EmptyState title="No data in this slice" />
            ) : (
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-panel/60">
                    <tr>
                      <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">{DIMENSION_LABELS[dimension]}</th>
                      <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Trades</th>
                      <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Win-rate</th>
                      <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Total PnL</th>
                      <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Avg/trade</th>
                      <th className="text-left px-3 py-2 font-mono uppercase tracking-wider w-1/3">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slices.map(s => {
                      const pnlClass = s.totalPnl > 0 ? 'text-long' : s.totalPnl < 0 ? 'text-short' : 'text-text-muted'
                      const winClass = s.count < 3 ? 'text-text-muted'
                        : s.winRate >= 0.55 ? 'text-long'
                        : s.winRate < 0.45 ? 'text-short'
                        : 'text-text-primary'
                      return (
                        <tr key={s.key} className="border-t border-border">
                          <td className="px-3 py-2 font-mono">{labelFor(dimension, s.key)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{s.count}</td>
                          <td className={cn('px-3 py-2 text-right font-mono tabular-nums', winClass)}>
                            {s.count < 3 ? '—' : `${(s.winRate * 100).toFixed(0)}%`}
                          </td>
                          <td className={cn('px-3 py-2 text-right font-mono tabular-nums font-semibold', pnlClass)}>
                            {s.totalPnl >= 0 ? '+' : ''}${s.totalPnl.toFixed(2)}
                          </td>
                          <td className={cn('px-3 py-2 text-right font-mono tabular-nums', pnlClass)}>
                            {s.avgPnl >= 0 ? '+' : ''}${s.avgPnl.toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            <DistBar value={s.totalPnl} maxAbs={maxAbs} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="text-[10px] text-text-muted font-mono">
              Win-rate dashes when count &lt; 3 — too few samples to be meaningful.
              Distribution bar is centered on $0; green = net winning, red = net losing.
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function bucket(t: BotTrade, d: Dimension): string {
  switch (d) {
    case 'source': return (t.signalId.split(':')[0] || 'unknown')
    case 'market': return t.marketId
    case 'hour': return String(new Date(t.openedAt).getUTCHours()).padStart(2, '0')
    case 'direction': return t.direction
    case 'exitReason': return t.exitReason ?? 'hold_expired'
  }
}

function labelFor(d: Dimension, key: string): string {
  if (d === 'hour') return `${key}:00 UTC`
  if (d === 'exitReason') return key.replace('_', ' ')
  return key
}

function DistBar({ value, maxAbs }: { value: number; maxAbs: number }) {
  if (maxAbs === 0) return null
  const pct = Math.min(100, (Math.abs(value) / maxAbs) * 100)
  const isPositive = value >= 0
  return (
    <div className="flex items-center h-3">
      <div className="flex-1 flex justify-end pr-px">
        {!isPositive && (
          <div className="h-full bg-short/70 rounded-l" style={{ width: `${pct}%` }} />
        )}
      </div>
      <div className="w-px h-full bg-border" />
      <div className="flex-1 pl-px">
        {isPositive && (
          <div className="h-full bg-long/70 rounded-r" style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  )
}
