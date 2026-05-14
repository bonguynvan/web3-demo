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
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react'
import { Wordmark } from '../components/ui/Logo'
import { useDocumentMeta } from '../lib/documentMeta'
import { fetchAdminMetrics, adminAvailable, type AdminMetrics } from '../api/admin'
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
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
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

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <h1 className="text-2xl md:text-3xl font-bold">Operator metrics</h1>

        {err && (
          <div className="rounded-md border border-short/40 bg-short/10 text-short px-4 py-3 text-sm">
            Failed to load: {err}
          </div>
        )}

        {!data && loading && (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading metrics…
          </div>
        )}

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
    <div className="space-y-8">
      <div className="text-[11px] text-text-muted font-mono">
        Snapshot at {stamp}
      </div>

      <section>
        <SectionHeader>Users + entitlements</SectionHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {data.proof_contributions_30d && (
        <section>
          <SectionHeader>Community proof — last 30 days</SectionHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Rows" value={data.proof_contributions_30d.rows.toLocaleString()} />
            <Stat label="Contributors" value={data.proof_contributions_30d.contributors.toLocaleString()} />
          </div>
        </section>
      )}
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
