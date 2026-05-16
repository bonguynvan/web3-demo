/**
 * FundingPage — multi-market funding rate + OI heatmap (Hyperliquid).
 *
 * The tape-reading surface a pro uses to spot regime shifts:
 *   - Funding rate >0 → longs paying shorts (crowded long, short squeeze risk)
 *   - Funding rate <0 → shorts paying longs (crowded short, squeeze risk)
 *   - High OI + extreme funding = position washout incoming
 *   - High OI Δ alongside price Δ tells you the move is "real" vs short-covering
 *
 * v1 covers HL only — they expose the full perp universe in one info
 * call. Coinglass-style multi-CEX aggregation is a future commit.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Flame } from 'lucide-react'
import { fetchHlFundingTable, type HlFundingRow } from '../lib/hyperliquidReader'
import { useDocumentMeta } from '../lib/documentMeta'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { cn } from '../lib/format'

const POLL_MS = 30_000

type SortKey = 'funding' | 'oi' | 'volume' | 'premium'

export function FundingPage() {
  useDocumentMeta({
    title: 'TradingDek — Funding & OI',
    description: 'Hyperliquid funding rates and open interest across all perps.',
    canonical: '/funding',
  })

  const [rows, setRows] = useState<HlFundingRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('funding')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    fetchHlFundingTable(ctrl.signal)
      .then(r => { setRows(r); setErr(null) })
      .catch(e => {
        if (ctrl.signal.aborted) return
        setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [tick])

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), POLL_MS)
    return () => clearInterval(id)
  }, [])

  const sorted = useMemo(() => {
    if (!rows) return []
    const arr = [...rows]
    const dir = sortDir === 'desc' ? -1 : 1
    arr.sort((a, b) => {
      const av = sortKey === 'funding' ? a.fundingAnnual
        : sortKey === 'oi' ? a.openInterestUsd
        : sortKey === 'volume' ? a.volume24hUsd
        : a.premiumPct
      const bv = sortKey === 'funding' ? b.fundingAnnual
        : sortKey === 'oi' ? b.openInterestUsd
        : sortKey === 'volume' ? b.volume24hUsd
        : b.premiumPct
      return (av - bv) * dir
    })
    return arr
  }, [rows, sortKey, sortDir])

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const totals = useMemo(() => {
    if (!rows) return null
    let totalOi = 0
    let totalVol = 0
    let posFunding = 0
    let negFunding = 0
    for (const r of rows) {
      totalOi += r.openInterestUsd
      totalVol += r.volume24hUsd
      if (r.fundingAnnual > 0) posFunding += 1
      else if (r.fundingAnnual < 0) negFunding += 1
    }
    return { totalOi, totalVol, posFunding, negFunding, total: rows.length }
  }, [rows])

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-5">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              Funding & open interest
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Hyperliquid · {rows?.length ?? '—'} markets · refreshes every 30s.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTick(t => t + 1)}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
              Refresh
            </button>
            <Link
              to="/profile"
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-accent/40 rounded-md px-2.5 py-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Profile
            </Link>
          </div>
        </header>

        {err && (
          <div className="rounded-md border border-short/40 bg-short/10 text-short px-4 py-3 text-sm">
            Failed to load: {err}
          </div>
        )}

        {!rows && loading && <LoadingState label="Fetching funding table…" />}

        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total OI" value={fmtBig(totals.totalOi)} />
            <Stat label="24h volume" value={fmtBig(totals.totalVol)} />
            <Stat label="Markets ↑ funding" value={`${totals.posFunding} / ${totals.total}`} tone="long" />
            <Stat label="Markets ↓ funding" value={`${totals.negFunding} / ${totals.total}`} tone="short" />
          </div>
        )}

        {rows && rows.length === 0 && (
          <EmptyState title="No markets returned" description="Hyperliquid's /info endpoint replied with an empty universe." />
        )}

        {sorted.length > 0 && (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-panel/60">
                <tr>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Coin</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Mark</th>
                  <SortTh active={sortKey === 'premium'} dir={sortDir} onClick={() => handleSort('premium')}>Premium</SortTh>
                  <SortTh active={sortKey === 'funding'} dir={sortDir} onClick={() => handleSort('funding')}>Funding (APR)</SortTh>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Hourly</th>
                  <SortTh active={sortKey === 'oi'} dir={sortDir} onClick={() => handleSort('oi')}>Open interest</SortTh>
                  <SortTh active={sortKey === 'volume'} dir={sortDir} onClick={() => handleSort('volume')}>24h volume</SortTh>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => {
                  const fundTone = r.fundingAnnual > 0.5 ? 'text-short'
                    : r.fundingAnnual > 0.1 ? 'text-amber-300'
                    : r.fundingAnnual < -0.5 ? 'text-long'
                    : r.fundingAnnual < -0.1 ? 'text-cyan-400'
                    : 'text-text-muted'
                  const premTone = Math.abs(r.premiumPct) >= 0.1
                    ? (r.premiumPct > 0 ? 'text-amber-300' : 'text-cyan-400')
                    : 'text-text-muted'
                  return (
                    <tr key={r.coin} className="border-t border-border hover:bg-panel/30">
                      <td className="px-3 py-1.5 font-mono font-medium">{r.coin}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtPx(r.markPx)}</td>
                      <td className={cn('px-3 py-1.5 text-right font-mono tabular-nums', premTone)}>
                        {r.premiumPct >= 0 ? '+' : ''}{r.premiumPct.toFixed(3)}%
                      </td>
                      <td className={cn('px-3 py-1.5 text-right font-mono tabular-nums font-semibold', fundTone)}>
                        {r.fundingAnnual >= 0 ? '+' : ''}{(r.fundingAnnual * 100).toFixed(2)}%
                      </td>
                      <td className={cn('px-3 py-1.5 text-right font-mono tabular-nums text-[10px]', fundTone)}>
                        {r.fundingHourly >= 0 ? '+' : ''}{(r.fundingHourly * 100).toFixed(4)}%
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtBig(r.openInterestUsd)}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-text-muted">{fmtBig(r.volume24hUsd)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {sorted.length > 0 && (
          <div className="text-[10px] text-text-muted font-mono space-y-0.5">
            <div>
              <span className="text-short">Red funding</span> = longs paying shorts (crowded long).
              <span className="text-long ml-2">Green funding</span> = shorts paying longs (crowded short).
            </div>
            <div>
              <span className="text-amber-300">Amber premium</span> = mark &gt; oracle.
              <span className="text-cyan-400 ml-2">Cyan premium</span> = mark &lt; oracle.
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function SortTh({ children, active, dir, onClick }: { children: React.ReactNode; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-0.5 hover:text-text-primary transition-colors cursor-pointer',
          active ? 'text-text-primary' : 'text-text-muted',
        )}
      >
        {children}
        {active && <span className="text-[8px]">{dir === 'desc' ? '▼' : '▲'}</span>}
      </button>
    </th>
  )
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'long' | 'short' | 'neutral' }) {
  const toneCls = tone === 'long' ? 'text-long' : tone === 'short' ? 'text-short' : 'text-text-primary'
  return (
    <div className="rounded-lg border border-border bg-panel/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-mono mb-1">{label}</div>
      <div className={cn('text-lg font-mono font-semibold tabular-nums', toneCls)}>{value}</div>
    </div>
  )
}

function fmtBig(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function fmtPx(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}
