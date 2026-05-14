/**
 * ProofPage — public, shareable signal track record.
 *
 * Same data the in-app hit-rate modal shows, but as a standalone page
 * with no app chrome — the URL you paste in a tweet or DM when someone
 * asks "does this actually work?". Read-only by design.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Copy, ExternalLink, ShieldCheck, Users, User as UserIcon, Lock, Loader2 } from 'lucide-react'
import { apiAvailable } from '../api/client'
import { fetchProofAggregate, type ProofAggregate } from '../api/proof'
import { useProofContributeStore } from '../store/proofContributeStore'
import { Wordmark } from '../components/ui/Logo'
import { useSignalPerformanceStore, type ResolvedEntry } from '../store/signalPerformanceStore'
import { SourceMarketHeatmap } from '../components/SourceMarketHeatmap'
import { SourceTrendSparkline } from '../components/SourceTrendSparkline'
import type { SignalSource } from '../signals/types'
import { cn } from '../lib/format'
import { useDocumentMeta } from '../lib/documentMeta'

const SOURCE_LABELS: Record<SignalSource, string> = {
  funding: 'Funding extremes',
  crossover: 'EMA crossover',
  rsi: 'RSI extremes',
  volatility: 'Volatility spikes',
  liquidation: 'Liquidation cascade',
  news: 'News catalyst',
  whale: 'Whale flow',
  confluence: 'Confluence (≥2)',
}

interface SourceRow {
  source: SignalSource
  total: number
  hits: number
  hitRate: number
}

interface MarketRow {
  marketId: string
  total: number
  hits: number
  hitRate: number
}

export function ProofPage() {
  useDocumentMeta({
    title: 'TradingDek — Public signal track record',
    description: 'Every signal we fire is timestamped and resolved 30 minutes later against actual price. No back-tested cherry-picking — falsifiable hit rates per source, generated from a client-side ledger.',
    canonical: '/proof',
    ogImage: '/proof-og.png',
  })
  const resolved = useSignalPerformanceStore(s => s.resolved)
  const pendingCount = useSignalPerformanceStore(s => s.pending.length)
  const [copied, setCopied] = useState(false)
  const [view, setView] = useState<'mine' | 'community'>('mine')

  const summary = useMemo(() => computeSummary(resolved), [resolved])

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary overflow-y-auto">
      <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <Wordmark size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/trade"
              className="hidden sm:flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Open the workstation
              <ExternalLink className="w-3 h-3" />
            </Link>
            <button
              onClick={handleShare}
              title="Copy link to share"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface text-xs font-semibold text-text-secondary hover:text-text-primary hover:border-accent transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-long" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Share'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        <section>
          <div className="flex items-center gap-2 mb-3 text-accent text-[11px] uppercase tracking-[0.18em] font-mono font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            Public track record
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight tracking-tight mb-4">
            Every signal we fire is timestamped<br />
            and resolved 30 minutes later<br />
            against actual price.
          </h1>
          <p className="text-text-secondary text-sm md:text-base leading-relaxed max-w-2xl">
            No back-tested cherry-picking, no curated screenshots. This page is generated
            from the same client-side ledger that powers the in-app hit-rate modal. If a
            source under-performs, you'll see it here.
          </p>
        </section>

        <section className="flex items-center gap-2 -mb-4">
          <TabButton active={view === 'mine'} onClick={() => setView('mine')} Icon={UserIcon}>
            Your ledger
          </TabButton>
          <TabButton active={view === 'community'} onClick={() => setView('community')} Icon={Users}>
            Community
            <span className="ml-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-text-muted">
              soon
            </span>
          </TabButton>
        </section>

        {view === 'community' ? (
          <CommunityProof />
        ) : (
          <>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Resolved signals" value={summary.totalResolved.toString()} />
          <Stat
            label="Overall hit rate"
            value={summary.totalResolved > 0 ? `${(summary.overallHitRate * 100).toFixed(0)}%` : '—'}
            tone={summary.totalResolved >= 3 ? (summary.overallHitRate >= 0.5 ? 'long' : 'short') : 'neutral'}
          />
          <Stat label="Pending resolution" value={pendingCount.toString()} />
          <Stat
            label="Tracked since"
            value={summary.firstAt ? new Date(summary.firstAt).toLocaleDateString() : '—'}
          />
        </section>

        <section>
          <SectionHeader title="Where each source works" />
          <SourceMarketHeatmap resolved={resolved} />
          <p className="text-[10px] text-text-muted mt-2 leading-relaxed">
            Each cell is one (signal source × market) pairing. Color = hit
            rate (red 0% → green 100%, neutral at 50%); size = sample
            count. Big green cells are reliable wins; big red cells are
            reliable losses worth turning off in a bot's allowed sources.
            Combos with fewer than 3 trades are hidden — too noisy to read.
          </p>
        </section>

        <section>
          <SectionHeader title="By source" />
          {summary.bySource.length === 0 ? (
            <EmptyHint>No resolved signals yet — open the workstation and let it run.</EmptyHint>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table
                cols={['Source', 'Resolved', 'Hits', 'Hit rate', 'Trend']}
                rightAlignFrom={1}
                rows={summary.bySource.map(r => [
                  SOURCE_LABELS[r.source] ?? r.source,
                  r.total.toString(),
                  r.hits.toString(),
                  <HitRateCell key={r.source} hitRate={r.hitRate} qualified={r.total >= 3} />,
                  <SourceTrendSparkline key={r.source} source={r.source} resolved={resolved} />,
                ])}
              />
            </div>
          )}
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          <div>
            <SectionHeader title="Top markets" />
            {summary.topMarkets.length === 0 ? (
              <EmptyHint>—</EmptyHint>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table
                  cols={['Market', 'Resolved', 'Hit rate']}
                  rightAlignFrom={1}
                  rows={summary.topMarkets.map(m => [
                    m.marketId,
                    m.total.toString(),
                    <HitRateCell key={m.marketId} hitRate={m.hitRate} qualified={m.total >= 3} />,
                  ])}
                />
              </div>
            )}
          </div>
          <div>
            <SectionHeader title="Recent outcomes" />
            {summary.recent.length === 0 ? (
              <EmptyHint>—</EmptyHint>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table
                  cols={['When', 'Source', 'Market', 'Move']}
                  rightAlignFrom={3}
                  rows={summary.recent.map(r => {
                    const movedPct = ((r.closePrice - r.entryPrice) / r.entryPrice) * 100
                    const sign = r.direction === 'long' ? movedPct : -movedPct
                    const moveText = `${sign >= 0 ? '+' : ''}${sign.toFixed(2)}%`
                    return [
                      relativeTime(Date.now() - r.closedAt),
                      SOURCE_LABELS[r.source] ?? r.source,
                      r.marketId,
                      <span key={r.id} className={cn('font-mono tabular-nums text-[11px]', r.hit ? 'text-long' : 'text-short')}>
                        {moveText}
                      </span>,
                    ]
                  })}
                />
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-border pt-6 text-[11px] text-text-muted leading-relaxed">
          <div className="font-mono uppercase tracking-[0.18em] text-text-secondary mb-2">How this works</div>
          Every signal records its market, direction, and trigger price the moment it
          fires. Thirty minutes later the same record is closed against the live mark.
          A "hit" means price moved in the predicted direction. Sources with fewer than
          3 resolved trades are flagged as <span className="text-text-secondary">unqualified</span>.
        </section>
          </>
        )}

        <section className="border-t border-border pt-6 flex items-center justify-between gap-4 flex-wrap">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to landing
          </Link>
          <Link
            to="/trade"
            className="px-4 py-2 rounded-md bg-accent text-surface text-xs font-semibold uppercase tracking-[0.18em] hover:opacity-90 transition-opacity"
          >
            Open the workstation →
          </Link>
        </section>
      </main>
    </div>
  )
}

function TabButton({
  active, onClick, Icon, children,
}: {
  active: boolean
  onClick: () => void
  Icon: typeof UserIcon
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer border',
        active
          ? 'bg-accent text-surface border-accent'
          : 'bg-panel border-border text-text-secondary hover:text-text-primary',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  )
}

/**
 * CommunityProof — live aggregate from /api/proof/aggregate plus the
 * opt-in toggle that controls whether this device contributes its own
 * resolved rows. When the backend isn't configured the panel falls
 * back to a "self-hosted only" explainer so local-dev still renders.
 */
function CommunityProof() {
  const enabled = useProofContributeStore(s => s.enabled)
  const setEnabled = useProofContributeStore(s => s.setEnabled)
  const lastUploadedAt = useProofContributeStore(s => s.lastUploadedAt)
  const [agg, setAgg] = useState<ProofAggregate | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!apiAvailable()) { setLoading(false); return }
    const ctrl = new AbortController()
    setLoading(true)
    fetchProofAggregate(ctrl.signal)
      .then(setAgg)
      .catch(e => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  if (!apiAvailable()) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-panel/30 px-6 py-10 text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-surface text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
          <Lock className="w-3 h-3" />
          Self-hosted only
        </div>
        <p className="text-sm text-text-secondary max-w-xl mx-auto leading-relaxed">
          Community aggregate needs a backend (VITE_API_BASE). Your local
          ledger above is still authoritative.
        </p>
      </section>
    )
  }

  const totalRows = agg?.by_source.reduce((s, r) => s + r.total, 0) ?? 0
  const totalHits = agg?.by_source.reduce((s, r) => s + r.hits, 0) ?? 0
  const overall = totalRows > 0 ? totalHits / totalRows : 0

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-panel/40 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text-primary">Community-wide hit rate</div>
            <div className="text-[11px] text-text-muted mt-0.5 leading-relaxed max-w-md">
              Aggregate of resolved signals contributed by opted-in users over the
              last {agg?.window_days ?? 30} days. Anonymous — only{' '}
              <code className="text-text-primary">{`{source, marketId, hit}`}</code>{' '}
              rows tied to a device id. No positions, balances, or PnL.
            </div>
          </div>
          <ContributeToggle enabled={enabled} onChange={setEnabled} lastUploadedAt={lastUploadedAt} />
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : err ? (
        <div className="rounded-lg border border-short/40 bg-short/10 text-short text-sm px-4 py-3">
          Failed to load aggregate: {err}
        </div>
      ) : totalRows < 25 ? (
        <EmptyHint>
          Aggregate is still warming up — only {totalRows} resolved rows from{' '}
          {agg?.contributors ?? 0} contributors so far. We hide the readout
          until 25+ rows so a single contributor can't skew the picture.
        </EmptyHint>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Resolved" value={totalRows.toLocaleString()} />
            <Stat
              label="Overall hit rate"
              value={`${(overall * 100).toFixed(0)}%`}
              tone={overall >= 0.5 ? 'long' : 'short'}
            />
            <Stat label="Contributors" value={String(agg?.contributors ?? 0)} />
            <Stat label="Window" value={`${agg?.window_days ?? 30} days`} />
          </section>

          <section>
            <SectionHeader title="By source" />
            <div className="rounded-lg border border-border overflow-hidden">
              <Table
                cols={['Source', 'Resolved', 'Hits', 'Hit rate']}
                rightAlignFrom={1}
                rows={agg!.by_source
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map(r => [
                    SOURCE_LABELS[r.source as keyof typeof SOURCE_LABELS] ?? r.source,
                    r.total.toLocaleString(),
                    r.hits.toLocaleString(),
                    <HitRateCell key={r.source} hitRate={r.hit_rate} qualified={r.total >= 3} />,
                  ])}
              />
            </div>
          </section>
        </>
      )}

      <p className="text-[10px] text-text-muted leading-relaxed border-t border-border pt-3">
        Contributed data is client-reported and opt-in.{' '}
        <Link to="/legal/privacy" className="text-accent hover:underline">
          Privacy policy
        </Link>.
      </p>
    </div>
  )
}

function ContributeToggle({
  enabled, onChange, lastUploadedAt,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
  lastUploadedAt: number
}) {
  const lastLabel = lastUploadedAt > 0
    ? `last upload ${new Date(lastUploadedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`
    : 'no uploads yet'
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={enabled}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-accent cursor-pointer mt-0.5"
      />
      <div>
        <div className="text-xs font-semibold text-text-primary">Contribute my resolved signals</div>
        <div className="text-[10px] text-text-muted mt-0.5">{enabled ? lastLabel : 'opt-in, anonymous, reversible'}</div>
      </div>
    </label>
  )
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'long' | 'short' | 'neutral' }) {
  const toneClass = tone === 'long' ? 'text-long' : tone === 'short' ? 'text-short' : 'text-text-primary'
  return (
    <div className="rounded-lg border border-border bg-panel/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-mono mb-1">{label}</div>
      <div className={cn('text-2xl font-mono font-semibold tabular-nums', toneClass)}>{value}</div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-[11px] uppercase tracking-[0.18em] font-mono font-semibold text-text-secondary mb-3">
      {title}
    </h2>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-text-muted">
      {children}
    </div>
  )
}

function Table({
  cols,
  rows,
  rightAlignFrom,
}: {
  cols: string[]
  rows: (React.ReactNode | string)[][]
  rightAlignFrom: number
}) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-panel/60">
        <tr>
          {cols.map((c, i) => (
            <th
              key={c}
              className={cn(
                'px-3 py-2 text-[10px] uppercase tracking-[0.16em] font-mono font-semibold text-text-muted',
                i >= rightAlignFrom ? 'text-right' : 'text-left',
              )}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rIdx) => (
          <tr key={rIdx} className="border-t border-border">
            {row.map((cell, cIdx) => (
              <td
                key={cIdx}
                className={cn(
                  'px-3 py-2',
                  cIdx >= rightAlignFrom ? 'text-right font-mono tabular-nums' : 'text-text-primary',
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function HitRateCell({ hitRate, qualified }: { hitRate: number; qualified: boolean }) {
  if (!qualified) {
    return <span className="text-text-muted text-[10px]">n &lt; 3</span>
  }
  const tone = hitRate >= 0.55 ? 'text-long' : hitRate >= 0.45 ? 'text-text-primary' : 'text-short'
  return <span className={cn('font-mono tabular-nums', tone)}>{(hitRate * 100).toFixed(0)}%</span>
}

interface Summary {
  totalResolved: number
  overallHitRate: number
  firstAt: number | null
  bySource: SourceRow[]
  topMarkets: MarketRow[]
  recent: ResolvedEntry[]
}

function computeSummary(resolved: ResolvedEntry[]): Summary {
  if (resolved.length === 0) {
    return { totalResolved: 0, overallHitRate: 0, firstAt: null, bySource: [], topMarkets: [], recent: [] }
  }

  let hits = 0
  let firstAt = resolved[0].triggeredAt
  const sourceBuckets = new Map<SignalSource, { total: number; hits: number }>()
  const marketBuckets = new Map<string, { total: number; hits: number }>()

  for (const r of resolved) {
    if (r.hit) hits += 1
    if (r.triggeredAt < firstAt) firstAt = r.triggeredAt

    const sb = sourceBuckets.get(r.source) ?? { total: 0, hits: 0 }
    sb.total += 1
    if (r.hit) sb.hits += 1
    sourceBuckets.set(r.source, sb)

    const mb = marketBuckets.get(r.marketId) ?? { total: 0, hits: 0 }
    mb.total += 1
    if (r.hit) mb.hits += 1
    marketBuckets.set(r.marketId, mb)
  }

  const bySource: SourceRow[] = Array.from(sourceBuckets.entries())
    .map(([source, b]) => ({ source, total: b.total, hits: b.hits, hitRate: b.hits / b.total }))
    .sort((a, b) => b.total - a.total)

  const topMarkets: MarketRow[] = Array.from(marketBuckets.entries())
    .map(([marketId, b]) => ({ marketId, total: b.total, hits: b.hits, hitRate: b.hits / b.total }))
    .sort((a, b) => (b.total === a.total ? b.hitRate - a.hitRate : b.total - a.total))
    .slice(0, 8)

  const recent = [...resolved].sort((a, b) => b.closedAt - a.closedAt).slice(0, 12)

  return {
    totalResolved: resolved.length,
    overallHitRate: hits / resolved.length,
    firstAt,
    bySource,
    topMarkets,
    recent,
  }
}

function relativeTime(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
