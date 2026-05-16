/**
 * AdminMetricsPage — single-tenant operator dashboard at /admin/metrics.
 *
 * Gated by VITE_ADMIN_KEY at build time. If the key isn't compiled
 * into this bundle the page redirects to /404. The backend also
 * enforces the same secret (constant-time compared against
 * ADMIN_DASHBOARD_KEY), so even a hand-crafted bundle can't read
 * data without it.
 *
 * Polls every 30s while the tab is open.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Wordmark } from '../components/ui/Logo'
import { LoadingState } from '../components/ui/LoadingState'
import { useDocumentMeta } from '../lib/documentMeta'
import {
  fetchAdminMetrics, adminAvailable,
  type AdminMetrics, type AdminUserRow, type AdminInvoiceRow, type AdminProofRow,
} from '../api/admin'
import { cn } from '../lib/format'

const POLL_MS = 30_000

export function AdminMetricsPage() {
  useDocumentMeta({
    title: 'TradingDek — Admin',
    description: 'Operator metrics dashboard.',
    canonical: '/admin/metrics',
  })
  const [data, setData] = useState<AdminMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!adminAvailable()) return
    const ctrl = new AbortController()
    setLoading(true)
    fetchAdminMetrics(ctrl.signal)
      .then(d => { setData(d); setErr(null) })
      .catch(e => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [refreshTick])

  useEffect(() => {
    if (!adminAvailable()) return
    const t = setInterval(() => setRefreshTick(n => n + 1), POLL_MS)
    return () => clearInterval(t)
  }, [])

  if (!adminAvailable()) {
    return <Navigate to="/404-admin-unavailable" replace />
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary overflow-y-auto">
      <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <Wordmark size="sm" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRefreshTick(n => n + 1)}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
              Refresh
            </button>
            <Link to="/" className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
              <ArrowLeft className="w-3 h-3" />
              Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-10 space-y-10">
        <h1 className="text-2xl md:text-3xl font-bold">Operator metrics</h1>

        {err && (
          <div className="rounded-md border border-short/40 bg-short/10 text-short px-4 py-3 text-sm">
            Failed to load: {err}
          </div>
        )}

        {!data && loading && <LoadingState label="Loading metrics…" />}

        {data && <MetricsBody data={data} />}
      </main>
    </div>
  )
}

function MetricsBody({ data }: { data: AdminMetrics }) {
  const stamp = useMemo(() => {
    try { return new Date(data.generated_at).toLocaleString() } catch { return data.generated_at }
  }, [data.generated_at])

  return (
    <div className="space-y-10">
      <div className="text-[11px] text-text-muted font-mono">
        Snapshot at {stamp}
      </div>

      <section>
        <SectionHeader>Users + entitlements</SectionHeader>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Users total" value={data.users_total.toLocaleString()} />
          <Stat label="Pro active" value={(data.entitlements?.pro_active ?? 0).toLocaleString()} tone="long" />
          <Stat label="On trial" value={(data.entitlements?.on_trial ?? 0).toLocaleString()} />
          <Stat label="Paid days" value={(data.entitlements?.paid_days_active ?? 0).toLocaleString()} />
          <Stat label="Paygo active" value={(data.entitlements?.paygo_active ?? 0).toLocaleString()} />
        </div>
      </section>

      <section>
        <SectionHeader>Revenue</SectionHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total $" value={`$${data.revenue_usd.toFixed(2)}`} tone="long" />
          <Stat label="Paid invoices" value={data.invoices_paid.toLocaleString()} />
        </div>
        {Object.keys(data.invoices_by_kind).length > 0 && (
          <div className="mt-3 rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-panel/60">
                <tr>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Kind</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Count</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Sum USD</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.invoices_by_kind).map(([kind, row]) => (
                  <tr key={kind} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{kind}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{row.count}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-long">${row.sum_usd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.signups_daily && data.signups_daily.length > 0 && (
        <section>
          <SectionHeader>Signups — last 30 days</SectionHeader>
          <BarSeries
            data={data.signups_daily.map(r => ({ label: r.day, value: r.n }))}
            tone="neutral"
            formatValue={(v) => v.toLocaleString()}
          />
        </section>
      )}

      {data.revenue_daily && data.revenue_daily.length > 0 && (
        <section>
          <SectionHeader>Revenue — last 30 days</SectionHeader>
          <BarSeries
            data={data.revenue_daily.map(r => ({ label: r.day, value: r.sum }))}
            tone="long"
            formatValue={(v) => `$${v.toFixed(2)}`}
          />
        </section>
      )}

      {data.recent_users && data.recent_users.length > 0 && (
        <section>
          <SectionHeader>Recent users (newest 25)</SectionHeader>
          <RecentUsersTable rows={data.recent_users} />
        </section>
      )}

      {data.recent_invoices && data.recent_invoices.length > 0 && (
        <section>
          <SectionHeader>Recent invoices (newest 25)</SectionHeader>
          <RecentInvoicesTable rows={data.recent_invoices} />
        </section>
      )}

      <section>
        <SectionHeader>Community proof — last 30 days</SectionHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Stat label="Rows" value={(data.proof_contributions_30d?.rows ?? 0).toLocaleString()} />
          <Stat label="Contributors" value={(data.proof_contributions_30d?.contributors ?? 0).toLocaleString()} />
        </div>

        {data.proof_by_source && data.proof_by_source.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden mb-4">
            <table className="w-full text-xs">
              <thead className="bg-panel/60">
                <tr>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Source</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Total</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Hits</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Hit-rate</th>
                </tr>
              </thead>
              <tbody>
                {data.proof_by_source.map(r => {
                  const rate = r.n > 0 ? (r.hits / r.n) * 100 : 0
                  return (
                    <tr key={r.source} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{r.source}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{r.n}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{r.hits}</td>
                      <td className={cn(
                        'px-3 py-2 text-right font-mono tabular-nums',
                        rate >= 55 ? 'text-long' : rate < 45 ? 'text-short' : ''
                      )}>{rate.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data.proof_by_market && data.proof_by_market.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-panel/60">
                <tr>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Top markets</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Signals</th>
                </tr>
              </thead>
              <tbody>
                {data.proof_by_market.map(r => (
                  <tr key={r.market_id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{r.market_id}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.recent_proof && data.recent_proof.length > 0 && (
        <section>
          <SectionHeader>Recent signals (newest 30)</SectionHeader>
          <RecentProofTable rows={data.recent_proof} />
        </section>
      )}
    </div>
  )
}

function RecentUsersTable({ rows }: { rows: AdminUserRow[] }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-panel/60">
          <tr>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Wallet</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Joined</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Status</th>
            <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Pro days</th>
            <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Paygo $</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Trial ends</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(u => {
            const trial = u.trial_expires_at && new Date(u.trial_expires_at).getTime() > Date.now()
            const status = !u.pro_active ? 'free' : trial ? 'trial' : u.pro_days_remaining > 0 ? 'paid' : 'paygo'
            const tone = status === 'paid' ? 'text-long' : status === 'trial' ? 'text-text-primary' : status === 'paygo' ? 'text-long/80' : 'text-text-muted'
            return (
              <tr key={u.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono">{truncWallet(u.wallet_address)}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{fmtDate(u.created)}</td>
                <td className={cn('px-3 py-2 font-mono uppercase', tone)}>{status}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{u.pro_days_remaining || ''}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{u.paygo_balance_usd > 0 ? `$${u.paygo_balance_usd.toFixed(2)}` : ''}</td>
                <td className="px-3 py-2 font-mono tabular-nums text-text-muted">{trial ? fmtDate(u.trial_expires_at) : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RecentInvoicesTable({ rows }: { rows: AdminInvoiceRow[] }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-panel/60">
          <tr>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Created</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Wallet</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Kind</th>
            <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">USD</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Currency</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Status</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Paid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(i => (
            <tr key={i.id} className="border-t border-border">
              <td className="px-3 py-2 font-mono tabular-nums text-text-muted">{fmtDate(i.created)}</td>
              <td className="px-3 py-2 font-mono">{truncWallet(i.wallet_address)}</td>
              <td className="px-3 py-2 font-mono">{i.kind}</td>
              <td className={cn(
                'px-3 py-2 text-right font-mono tabular-nums',
                i.status === 'paid' ? 'text-long' : ''
              )}>${i.amount_usd.toFixed(2)}</td>
              <td className="px-3 py-2 font-mono uppercase text-text-muted">{i.pay_currency || '—'}</td>
              <td className={cn(
                'px-3 py-2 font-mono uppercase',
                i.status === 'paid' ? 'text-long' : i.status === 'expired' ? 'text-short' : 'text-text-muted'
              )}>{i.status}</td>
              <td className="px-3 py-2 font-mono tabular-nums text-text-muted">{i.paid_at ? fmtDate(i.paid_at) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RecentProofTable({ rows }: { rows: AdminProofRow[] }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-panel/60">
          <tr>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Created</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Market</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Source</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Dir</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Outcome</th>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Closed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-3 py-2 font-mono tabular-nums text-text-muted">{fmtDate(p.created)}</td>
              <td className="px-3 py-2 font-mono">{p.market_id}</td>
              <td className="px-3 py-2 font-mono">{p.source}</td>
              <td className={cn(
                'px-3 py-2 font-mono uppercase',
                p.direction === 'long' ? 'text-long' : 'text-short'
              )}>{p.direction}</td>
              <td className={cn(
                'px-3 py-2 font-mono uppercase',
                p.hit === true ? 'text-long' : p.hit === false ? 'text-short' : 'text-text-muted'
              )}>{p.hit === true ? 'hit' : p.hit === false ? 'miss' : 'open'}</td>
              <td className="px-3 py-2 font-mono tabular-nums text-text-muted">{p.closed_at ? fmtDate(p.closed_at) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BarSeries({ data, tone, formatValue }: { data: Array<{ label: string; value: number }>; tone: 'long' | 'short' | 'neutral'; formatValue: (v: number) => string }) {
  const max = Math.max(1, ...data.map(d => d.value))
  const bg = tone === 'long' ? 'bg-long/70' : tone === 'short' ? 'bg-short/70' : 'bg-text-primary/40'
  return (
    <div className="rounded-lg border border-border bg-panel/30 p-3">
      <div className="flex items-end gap-[3px] h-32">
        {data.map(d => {
          const h = Math.max(2, Math.round((d.value / max) * 100))
          return (
            <div
              key={d.label}
              className={cn('flex-1 rounded-sm transition-colors hover:opacity-80 cursor-default', bg)}
              style={{ height: `${h}%` }}
              title={`${d.label}: ${formatValue(d.value)}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between mt-2 text-[10px] font-mono text-text-muted">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] uppercase tracking-[0.18em] font-mono font-semibold text-text-secondary mb-3">
      {children}
    </h2>
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

function truncWallet(w: string): string {
  if (!w) return '—'
  if (w.length <= 12) return w
  return `${w.slice(0, 6)}…${w.slice(-4)}`
}

function fmtDate(s: string): string {
  if (!s) return ''
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toISOString().slice(0, 16).replace('T', ' ')
  } catch {
    return s
  }
}
