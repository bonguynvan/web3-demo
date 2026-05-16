/**
 * RiskDashboardPage — at-a-glance view of risk-cap utilization.
 *
 * Pairs with useRiskMonitor (which silently auto-pauses bots when a
 * cap fires). This page surfaces *current values vs configured caps*
 * so the operator can see headroom before anything fires:
 *
 *   - Daily realized PnL (last 24h) vs dailyPnlCapUsd
 *   - Peak-to-trough drawdown vs maxDrawdownUsd
 *   - Open-trade notional vs maxExposureUsd
 *
 * Plus a per-market concentration breakdown to spot single-asset
 * over-allocation that the global exposure cap can't catch.
 *
 * Math is duplicated from useRiskMonitor on purpose — keeping this
 * page a pure read-only render keeps the engine surface small.
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, AlertTriangle, Settings as SettingsIcon } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useRiskStore } from '../store/riskStore'
import { useDocumentMeta } from '../lib/documentMeta'
import { EmptyState } from '../components/ui/EmptyState'
import { cn } from '../lib/format'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function RiskDashboardPage() {
  useDocumentMeta({
    title: 'TradingDek — Risk',
    description: 'Bot risk-cap utilization and exposure breakdown.',
    canonical: '/risk',
  })

  const trades = useBotStore(s => s.trades)
  const bots = useBotStore(s => s.bots)
  const dailyPnlCapUsd = useRiskStore(s => s.dailyPnlCapUsd)
  const maxDrawdownUsd = useRiskStore(s => s.maxDrawdownUsd)
  const maxExposureUsd = useRiskStore(s => s.maxExposureUsd)
  const breach = useRiskStore(s => s.breach)

  const metrics = useMemo(() => {
    const cutoff = Date.now() - ONE_DAY_MS
    const closedSorted = trades
      .filter(t => t.closedAt !== undefined && t.pnlUsd !== undefined)
      .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))

    let realizedToday = 0
    for (const t of closedSorted) {
      if ((t.closedAt ?? 0) >= cutoff) realizedToday += t.pnlUsd ?? 0
    }

    let peak = 0
    let cum = 0
    let drawdown = 0
    for (const t of closedSorted) {
      cum += t.pnlUsd ?? 0
      if (cum > peak) peak = cum
      const dd = peak - cum
      if (dd > drawdown) drawdown = dd
    }

    const openTrades = trades.filter(t => t.closedAt === undefined)
    const exposure = openTrades.reduce((s, t) => s + t.positionUsd, 0)

    // Aggregate open risk — sum across every open trade with a stop:
    //   risk_i = positionUsd_i × stopLossPct_i / 100
    // The single number a pro watches most: "if every stop fires today,
    // this is the total loss." Trades without a stop contribute their
    // full positionUsd as risk (treated as 100% downside) so users see
    // exactly how dangerous unstopped trades are.
    const botById = new Map(bots.map(b => [b.id, b]))
    let openRiskUsd = 0
    let unstoppedCount = 0
    for (const t of openTrades) {
      const b = botById.get(t.botId)
      const slPct = b?.stopLossPct
      if (slPct && slPct > 0) {
        openRiskUsd += t.positionUsd * (slPct / 100)
      } else {
        openRiskUsd += t.positionUsd
        unstoppedCount += 1
      }
    }

    const byMarket = new Map<string, number>()
    for (const t of openTrades) {
      byMarket.set(t.marketId, (byMarket.get(t.marketId) ?? 0) + t.positionUsd)
    }
    const markets = Array.from(byMarket.entries())
      .map(([marketId, usd]) => ({ marketId, usd, pct: exposure > 0 ? usd / exposure : 0 }))
      .sort((a, b) => b.usd - a.usd)

    return {
      realizedToday, drawdown, exposure, openTrades: openTrades.length, markets, peak, cum,
      openRiskUsd, unstoppedCount,
    }
  }, [trades, bots])

  const anyCapSet = dailyPnlCapUsd > 0 || maxDrawdownUsd > 0 || maxExposureUsd > 0

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              Risk dashboard
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Current cap utilization. Bots auto-pause when any cap fires.
            </p>
          </div>
          <Link
            to="/profile"
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-accent/40 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            Configure caps
          </Link>
        </header>

        {breach && (
          <div className="rounded-md border border-short/40 bg-short/10 text-short px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Cap breach — bots paused</div>
              <div className="text-xs opacity-90 mt-0.5">{breach.reason}</div>
              <div className="text-[10px] opacity-70 mt-1 font-mono">
                {new Date(breach.at).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {!anyCapSet && (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 text-amber-200 px-4 py-3 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              No risk caps configured. Bots will run unbounded until you set at least one cap
              in <Link to="/profile" className="underline">Profile → Risk caps</Link>.
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-panel/40 px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-mono mb-1">
                Total open risk
              </div>
              <div className={cn(
                'text-2xl font-mono font-semibold tabular-nums',
                metrics.openRiskUsd > 0 ? 'text-short' : 'text-text-muted',
              )}>
                -${metrics.openRiskUsd.toFixed(2)}
              </div>
              <div className="text-[11px] text-text-muted mt-1">
                {metrics.openTrades === 0
                  ? 'No open positions.'
                  : `If every stop fires today across ${metrics.openTrades} open trade${metrics.openTrades === 1 ? '' : 's'}.`}
                {metrics.unstoppedCount > 0 && (
                  <span className="text-amber-300 ml-2">
                    {metrics.unstoppedCount} unstopped (counted at full notional)
                  </span>
                )}
              </div>
            </div>
            {metrics.openRiskUsd > 0 && metrics.exposure > 0 && (
              <div className="text-right text-[10px] font-mono text-text-muted">
                <div>{((metrics.openRiskUsd / metrics.exposure) * 100).toFixed(1)}% of exposure</div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <RiskCard
            label="Daily loss"
            current={-Math.min(0, metrics.realizedToday)}
            cap={dailyPnlCapUsd}
            tone={metrics.realizedToday < 0 ? 'short' : 'neutral'}
            sublabel={`Realized 24h: ${fmtPnl(metrics.realizedToday)}`}
          />
          <RiskCard
            label="Drawdown"
            current={metrics.drawdown}
            cap={maxDrawdownUsd}
            tone={metrics.drawdown > 0 ? 'short' : 'neutral'}
            sublabel={`Peak: ${fmtPnl(metrics.peak)} · Now: ${fmtPnl(metrics.cum)}`}
          />
          <RiskCard
            label="Open exposure"
            current={metrics.exposure}
            cap={maxExposureUsd}
            tone={metrics.exposure > 0 ? 'long' : 'neutral'}
            sublabel={`${metrics.openTrades} open trade${metrics.openTrades === 1 ? '' : 's'}`}
          />
        </div>

        <section>
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-mono font-semibold text-text-secondary mb-3">
            Per-market concentration
          </h2>
          {metrics.markets.length === 0 ? (
            <EmptyState
              title="No open positions"
              description="Concentration appears here when bots start taking trades."
            />
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-panel/60">
                  <tr>
                    <th className="text-left px-3 py-2 font-mono uppercase tracking-wider">Market</th>
                    <th className="text-right px-3 py-2 font-mono uppercase tracking-wider">Notional</th>
                    <th className="text-right px-3 py-2 font-mono uppercase tracking-wider w-2/5">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.markets.map(m => (
                    <tr key={m.marketId} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{m.marketId}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">${m.usd.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                            <div
                              className={cn(
                                'h-full transition-all',
                                m.pct >= 0.5 ? 'bg-short/80' : m.pct >= 0.3 ? 'bg-amber-400/80' : 'bg-long/60',
                              )}
                              style={{ width: `${Math.min(100, m.pct * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono tabular-nums text-text-muted w-12 text-right">
                            {(m.pct * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-[10px] text-text-muted mt-2 font-mono">
            Color thresholds: ≥50% red · ≥30% amber · &lt;30% green.
          </div>
        </section>
      </section>
    </div>
  )
}

function RiskCard({
  label, current, cap, tone, sublabel,
}: {
  label: string
  current: number
  cap: number
  tone: 'long' | 'short' | 'neutral'
  sublabel?: string
}) {
  const pct = cap > 0 ? Math.min(1, current / cap) : 0
  const off = cap === 0
  const bar = off
    ? 'bg-text-muted/30'
    : pct >= 0.9 ? 'bg-short/80'
      : pct >= 0.6 ? 'bg-amber-400/80'
        : tone === 'short' ? 'bg-short/70'
          : tone === 'long' ? 'bg-long/70'
            : 'bg-text-primary/40'

  return (
    <div className="rounded-lg border border-border bg-panel/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-mono mb-1">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xl font-mono font-semibold tabular-nums">
          ${current.toFixed(2)}
        </div>
        <div className="text-[11px] font-mono text-text-muted tabular-nums">
          / {off ? '∞' : `$${cap.toFixed(0)}`}
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-surface overflow-hidden">
        <div
          className={cn('h-full transition-all', bar)}
          style={{ width: `${off ? 0 : Math.min(100, pct * 100)}%` }}
        />
      </div>
      {sublabel && (
        <div className="text-[10px] font-mono text-text-muted mt-1.5 truncate" title={sublabel}>
          {sublabel}
        </div>
      )}
    </div>
  )
}

function fmtPnl(usd: number): string {
  const sign = usd > 0 ? '+' : usd < 0 ? '-' : ''
  return `${sign}$${Math.abs(usd).toFixed(2)}`
}
