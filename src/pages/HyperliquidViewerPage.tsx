/**
 * HyperliquidViewerPage — read-only Hyperliquid account viewer.
 *
 * Paste any 0x address and inspect its clearinghouse state and recent
 * fills. No wallet connection, no signing — pure public-data queries
 * against api.hyperliquid.xyz/info. Useful for whale-watching, your
 * own non-connected wallets, or auditing a copy-trade target.
 *
 * URL state: `?address=0x...` is the source of truth (shareable, no
 * persistence). Auto-refreshes every 30s while the tab is open.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Search, Wallet, Loader2 } from 'lucide-react'
import { fetchHlAccount, fetchHlFills, isValidAddress, type HlAccount, type HlFill } from '../lib/hyperliquidReader'
import { useDocumentMeta } from '../lib/documentMeta'
import { cn } from '../lib/format'

const POLL_MS = 30_000

const WHALES = (import.meta.env.VITE_HL_WHALE_WALLETS as string | undefined)
  ?.split(',').map(s => s.trim()).filter(isValidAddress) ?? []

export function HyperliquidViewerPage() {
  useDocumentMeta({
    title: 'TradingDek — Hyperliquid viewer',
    description: 'Read-only Hyperliquid account inspector.',
    canonical: '/hl',
  })

  const [params, setParams] = useSearchParams()
  const urlAddr = params.get('address')?.trim() ?? ''
  const [input, setInput] = useState(urlAddr)
  const [tick, setTick] = useState(0)
  const [account, setAccount] = useState<HlAccount | null>(null)
  const [fills, setFills] = useState<HlFill[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const addr = isValidAddress(urlAddr) ? urlAddr : ''

  useEffect(() => {
    setInput(urlAddr)
  }, [urlAddr])

  useEffect(() => {
    if (!addr) {
      setAccount(null)
      setFills(null)
      setErr(null)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    setErr(null)
    Promise.all([
      fetchHlAccount(addr, ctrl.signal),
      fetchHlFills(addr, ctrl.signal),
    ])
      .then(([acc, fls]) => { setAccount(acc); setFills(fls) })
      .catch(e => {
        if (ctrl.signal.aborted) return
        setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [addr, tick])

  useEffect(() => {
    if (!addr) return
    const id = setInterval(() => setTick(t => t + 1), POLL_MS)
    return () => clearInterval(id)
  }, [addr])

  const submit = (next: string) => {
    const t = next.trim()
    if (!t) {
      setParams({}, { replace: true })
      return
    }
    if (!isValidAddress(t)) {
      setErr('Not a valid 0x address (need 0x + 40 hex chars)')
      return
    }
    setErr(null)
    setParams({ address: t }, { replace: true })
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary overflow-y-auto">
      <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </Link>
          <div className="flex items-center gap-3">
            {addr && (
              <button
                onClick={() => setTick(t => t + 1)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                title="Refresh now (auto-refresh every 30s)"
              >
                <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
                Refresh
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-accent" />
            Hyperliquid viewer
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Read-only inspector. Paste any wallet to see its account value, open positions, and recent fills.
          </p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); submit(input) }}
          className="flex items-center gap-2 max-w-2xl"
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x..."
              spellCheck={false}
              autoComplete="off"
              className="w-full pl-8 pr-3 py-2 text-sm bg-panel/40 border border-border rounded-md font-mono outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 text-sm font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Inspect
          </button>
        </form>

        {WHALES.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-text-muted font-mono uppercase tracking-wider">Whale wallets:</span>
            {WHALES.map(w => (
              <button
                key={w}
                onClick={() => { setInput(w); submit(w) }}
                className={cn(
                  'font-mono px-2 py-1 rounded border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors cursor-pointer',
                  addr === w ? 'border-accent/60 bg-accent-dim/20' : 'border-border'
                )}
              >
                {truncAddr(w)}
              </button>
            ))}
          </div>
        )}

        {err && (
          <div className="rounded-md border border-short/40 bg-short/10 text-short px-4 py-3 text-sm">
            {err}
          </div>
        )}

        {!addr && (
          <div className="rounded-lg border border-border bg-panel/30 px-4 py-10 text-center text-sm text-text-muted">
            Paste a 0x address above to begin.
          </div>
        )}

        {addr && !account && loading && (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Fetching account state…
          </div>
        )}

        {account && (
          <AccountBody account={account} fills={fills ?? []} />
        )}
      </main>
    </div>
  )
}

function AccountBody({ account, fills }: { account: HlAccount; fills: HlFill[] }) {
  const stamp = useMemo(() => new Date(account.fetchedAt).toLocaleTimeString(), [account.fetchedAt])
  const totalUnrealized = account.positions.reduce((s, p) => s + p.unrealizedPnl, 0)
  const recent = fills.slice(0, 50)

  return (
    <div className="space-y-10">
      <div className="text-[11px] text-text-muted font-mono">
        Snapshot at {stamp} for <span className="text-text-secondary">{account.address}</span>
      </div>

      <section>
        <SectionHeader>Account</SectionHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Account value" value={fmtUsd(account.accountValueUsd)} tone={account.accountValueUsd >= 0 ? 'long' : 'short'} />
          <Stat label="Total notional" value={fmtUsd(account.totalNotionalUsd)} />
          <Stat label="Margin used" value={fmtUsd(account.totalMarginUsedUsd)} />
          <Stat label="Withdrawable" value={fmtUsd(account.withdrawableUsd)} />
        </div>
      </section>

      <section>
        <SectionHeader>Open positions · unrealized {fmtPnl(totalUnrealized)}</SectionHeader>
        {account.positions.length === 0 ? (
          <div className="rounded-lg border border-border bg-panel/30 px-4 py-6 text-center text-xs text-text-muted">
            No open positions.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-panel/60">
                <tr>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Coin</th>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Side</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Size</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Entry</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Notional</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">uPnL</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">ROE</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Lev</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Liq px</th>
                </tr>
              </thead>
              <tbody>
                {account.positions.map(p => (
                  <tr key={p.coin} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{p.coin}</td>
                    <td className={cn('px-3 py-2 font-mono uppercase', p.side === 'long' ? 'text-long' : 'text-short')}>
                      {p.side}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtNum(p.size)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{p.entryPx !== null ? fmtNum(p.entryPx) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtUsd(p.notionalUsd)}</td>
                    <td className={cn(
                      'px-3 py-2 text-right font-mono tabular-nums',
                      p.unrealizedPnl > 0 ? 'text-long' : p.unrealizedPnl < 0 ? 'text-short' : ''
                    )}>{fmtPnl(p.unrealizedPnl)}</td>
                    <td className={cn(
                      'px-3 py-2 text-right font-mono tabular-nums',
                      p.roePct > 0 ? 'text-long' : p.roePct < 0 ? 'text-short' : ''
                    )}>{(p.roePct * 100).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{p.leverage}×</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-text-muted">
                      {p.liquidationPx !== null ? fmtNum(p.liquidationPx) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <SectionHeader>Recent fills (newest {recent.length})</SectionHeader>
        {recent.length === 0 ? (
          <div className="rounded-lg border border-border bg-panel/30 px-4 py-6 text-center text-xs text-text-muted">
            No fills.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-panel/60">
                <tr>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Time</th>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Coin</th>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Side</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Size</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Price</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Notional</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">PnL</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Fee</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(f => (
                  <tr key={`${f.hash}-${f.time}`} className="border-t border-border">
                    <td className="px-3 py-2 font-mono tabular-nums text-text-muted">{fmtTime(f.time)}</td>
                    <td className="px-3 py-2 font-mono">{f.coin}</td>
                    <td className={cn('px-3 py-2 font-mono uppercase', f.side === 'buy' ? 'text-long' : 'text-short')}>
                      {f.side}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtNum(f.size)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtNum(f.px)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtUsd(f.notionalUsd)}</td>
                    <td className={cn(
                      'px-3 py-2 text-right font-mono tabular-nums',
                      f.closedPnl > 0 ? 'text-long' : f.closedPnl < 0 ? 'text-short' : 'text-text-muted'
                    )}>{f.closedPnl !== 0 ? fmtPnl(f.closedPnl) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-text-muted">${f.feeUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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

function truncAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPnl(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

function fmtTime(ms: number): string {
  try {
    const d = new Date(ms)
    return d.toISOString().slice(5, 16).replace('T', ' ')
  } catch {
    return String(ms)
  }
}
