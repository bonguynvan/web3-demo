/**
 * PortfolioPage — what the user actually owns + paper-traded.
 *
 * Today's truth: paper bot ledger + open positions. The legacy on-chain
 * perp/futures hookups have been removed — they belonged to the previous
 * iteration of this app as a custom DEX.
 *
 * Future: when a venue API key is unlocked (vault), pull real spot
 * balances and live positions through the authenticated adapter.
 * Section is in place; loading is gated on auth state.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTradingStore } from '../store/tradingStore'
import { Wallet, Bot, TrendingUp, TrendingDown, KeyRound, ArrowRight, RefreshCw } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { computeStats } from '../bots/computeStats'
import { getActiveAdapter, listAdapters } from '../adapters/registry'
import { useActiveVenue } from '../hooks/useActiveVenue'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { useVenueBalances, type VenueBalanceState } from '../hooks/useVenueBalances'
import { useVenueOpenOrders } from '../hooks/useVenueOpenOrders'
import { getAdapter } from '../adapters/registry'
import { useToast } from '../store/toastStore'
import { X } from 'lucide-react'
import type { VenueId } from '../adapters/types'
import { EquityCurve } from '../components/EquityCurve'
import { cn, formatUsd } from '../lib/format'
import type { BotTrade } from '../bots/types'

const TICK_MS = 5_000

export function PortfolioPage() {
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const activeVenueId = useActiveVenue()
  const sessionUnlocked = useVaultSessionStore(s => s.unlocked)
  const adapters = listAdapters()
  const { states: venueBalances, refresh: refreshBalances } = useVenueBalances()
  const { states: venueOpenOrders, refresh: refreshOpenOrders } = useVenueOpenOrders()
  const toast = useToast()
  const cancelOrder = async (venueId: string, marketId: string, orderId: string) => {
    if (!confirm(`Cancel ${marketId} order ${orderId} on ${venueId}? This is a real venue action.`)) return
    const a = getAdapter(venueId as VenueId)
    if (!a) {
      toast.error('Cancel failed', `Adapter ${venueId} not found`)
      return
    }
    try {
      await a.cancelOrder({ marketId, orderId })
      toast.success('Order canceled', `${marketId} ${orderId}`)
      refreshOpenOrders()
      refreshBalances()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      toast.error('Cancel failed', msg)
    }
  }
  const liveOpenOrders = Object.entries(venueOpenOrders).flatMap(([venueId, st]) =>
    (st?.orders ?? []).map(o => ({ venueId, order: o })))
  const navigate = useNavigate()
  const setSelectedMarket = useTradingStore(s => s.setSelectedMarket)
  const goToMarket = (asset: string) => {
    if (asset === 'USDT') return // no self-pair
    const id = `${asset}/USDT`
    if (adapter.getMarket(id)) {
      setSelectedMarket(id)
      navigate('/trade')
    }
  }

  // Live equity across authed venues. Stablecoins count at $1.
  // Non-stables priced via the active adapter's ticker cache (best-effort
  // `${asset}/USDT` lookup). Holdings without a ticker are skipped — the
  // figure is "live equity I can see right now", not a forced 100%-attributed
  // valuation.
  const STABLES = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'FDUSD'])
  let stableTotal = 0
  let cryptoUsd = 0
  let unpricedCount = 0
  for (const v of Object.values(venueBalances)) {
    for (const b of v?.balances ?? []) {
      const total = b.free + b.locked
      if (total === 0) continue
      if (STABLES.has(b.asset)) {
        stableTotal += total
        continue
      }
      const ticker = adapter.getTicker(`${b.asset}/USDT`)
      if (ticker?.price) {
        cryptoUsd += total * ticker.price
      } else {
        unpricedCount += 1
      }
    }
  }
  const liveEquity = stableTotal + cryptoUsd
  const hasLiveBalances = liveEquity > 0 || Object.values(venueBalances).some(v => v?.balances && v.balances.length > 0)
  const [, force] = useState(0)

  // Heartbeat for live unrealized PnL.
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const adapter = getActiveAdapter()
  const stats = computeStats(trades, m => adapter.getTicker(m)?.price)

  const closedSorted = trades
    .filter((t): t is BotTrade & { closedAt: number; pnlUsd: number } =>
      t.closedAt !== undefined && t.pnlUsd !== undefined)
    .sort((a, b) => a.closedAt - b.closedAt)

  const openTrades = trades.filter(t => !t.closedAt)
  const recentClosed = [...closedSorted].reverse().slice(0, 10)

  // Per-market aggregate (paper bots only today)
  const byMarket = new Map<string, { trades: number; pnl: number; openCount: number }>()
  for (const t of trades) {
    const b = byMarket.get(t.marketId) ?? { trades: 0, pnl: 0, openCount: 0 }
    b.trades += 1
    if (t.closedAt && t.pnlUsd !== undefined) b.pnl += t.pnlUsd
    if (!t.closedAt) b.openCount += 1
    byMarket.set(t.marketId, b)
  }
  const marketRows = Array.from(byMarket.entries())
    .sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl))

  const pnlColor = stats.totalPnlUsd >= 0 ? 'text-long' : 'text-short'
  const realizedColor = stats.realizedPnlUsd >= 0 ? 'text-long' : 'text-short'
  const unrealizedColor = stats.unrealizedPnlUsd >= 0 ? 'text-long' : 'text-short'

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-6">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Portfolio</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Paper-traded P&L from all bots, plus venue balances once an API key is connected.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-amber-400/10 text-amber-400 border border-amber-400/30">
            Paper mode
          </span>
        </header>

        {/* Hero P&L */}
        <div className="bg-panel border border-border rounded-lg p-6">
          <div className="flex flex-wrap items-end gap-6 mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">Total P&L</div>
              <div className={cn('text-3xl font-mono font-bold tabular-nums mt-1', pnlColor)}>
                {stats.totalPnlUsd >= 0 ? '+' : ''}${formatUsd(stats.totalPnlUsd)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">Realized</div>
              <div className={cn('text-base font-mono mt-1', realizedColor)}>
                {stats.realizedPnlUsd >= 0 ? '+' : ''}${formatUsd(stats.realizedPnlUsd)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">Unrealized</div>
              <div className={cn('text-base font-mono mt-1', unrealizedColor)}>
                {stats.unrealizedPnlUsd >= 0 ? '+' : ''}${formatUsd(stats.unrealizedPnlUsd)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">Win rate</div>
              <div className="text-base font-mono mt-1">
                {stats.closed > 0 ? `${Math.round(stats.winRate * 100)}%` : '—'}
                <span className="text-text-muted text-xs ml-2">{stats.closed} closed</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">Open</div>
              <div className="text-base font-mono mt-1">{stats.open}</div>
            </div>
            {hasLiveBalances && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Live equity</div>
                <div className="text-base font-mono mt-1 text-text-primary">
                  ${formatUsd(liveEquity)}
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">
                  {stableTotal > 0 && `$${formatUsd(stableTotal)} cash`}
                  {stableTotal > 0 && cryptoUsd > 0 && ' · '}
                  {cryptoUsd > 0 && `$${formatUsd(cryptoUsd)} crypto`}
                  {unpricedCount > 0 && (
                    <span className="ml-1">· {unpricedCount} unpriced</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {closedSorted.length >= 2 ? (
            <EquityCurve trades={closedSorted} height={64} />
          ) : (
            <div className="h-16 flex items-center justify-center text-xs text-text-muted">
              Equity curve appears once 2+ trades have closed.
            </div>
          )}
        </div>

        {/* Venue connection callout (real balances) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {adapters.map(a => {
            const isActive = a.id === activeVenueId
            const isAuthed = sessionUnlocked
              && typeof (a as { isAuthenticated?: () => boolean }).isAuthenticated === 'function'
              && (a as { isAuthenticated: () => boolean }).isAuthenticated()
            return (
              <div key={a.id} className="bg-panel/60 border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-text-muted" />
                      <span className="text-sm font-semibold capitalize">{a.id}</span>
                      {isActive && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-dim text-accent">
                          Active
                        </span>
                      )}
                      {isAuthed && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-long/15 text-long">
                          Connected
                        </span>
                      )}
                      {isAuthed && (
                        <span className={cn(
                          'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                          a.capabilities.trading
                            ? 'bg-amber-400/15 text-amber-400'
                            : 'bg-surface border border-border text-text-muted',
                        )}>
                          {a.capabilities.trading ? 'Trading' : 'Read-only'}
                        </span>
                      )}
                    </div>
                    {!isAuthed && (
                      <div className="text-[11px] text-text-muted mt-1 leading-relaxed">
                        Connect an API key (CEX) or wallet (DEX) to see live balances and authenticate trading.
                      </div>
                    )}
                  </div>
                  {isAuthed ? (
                    <button
                      onClick={refreshBalances}
                      title="Refresh balances now"
                      className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-text-muted hover:text-text-primary hover:bg-panel-light cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <Link
                      to="/profile"
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light cursor-pointer"
                    >
                      <KeyRound className="w-3 h-3" />
                      Connect
                    </Link>
                  )}
                </div>
                {isAuthed && (
                  <BalanceList
                    state={venueBalances[a.id as keyof typeof venueBalances]}
                    priceOf={(asset) => {
                      if (STABLES.has(asset)) return 1
                      return adapter.getTicker(`${asset}/USDT`)?.price
                    }}
                    onAssetClick={goToMarket}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Live open orders on connected venues */}
        {liveOpenOrders.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-2">
              Live open orders ({liveOpenOrders.length})
            </h2>
            <div className="bg-panel border border-border rounded-lg overflow-hidden">
              <Table
                rows={liveOpenOrders.map(({ venueId, order }) => [
                  <span className="capitalize text-text-muted">{venueId}</span>,
                  order.marketId,
                  <span className={cn(
                    'text-[10px] uppercase tracking-wider font-semibold',
                    order.side === 'buy' ? 'text-long' : 'text-short',
                  )}>
                    {order.side}
                  </span>,
                  order.type,
                  order.price !== undefined ? `$${formatUsd(order.price)}` : '—',
                  order.size.toLocaleString(undefined, { maximumFractionDigits: 6 }),
                  order.filledSize > 0
                    ? `${((order.filledSize / order.size) * 100).toFixed(0)}%`
                    : '—',
                  new Date(order.createdAt).toLocaleString(),
                  <button
                    onClick={() => cancelOrder(venueId, order.marketId, order.id)}
                    title="Cancel this order"
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-short hover:bg-short/10 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>,
                ])}
                columns={['Venue', 'Market', 'Side', 'Type', 'Price', 'Size', 'Filled', 'Created', '']}
              />
            </div>
          </div>
        )}

        {/* Open positions */}
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Bot className="w-4 h-4 text-accent" />
            Paper open positions ({openTrades.length})
          </h2>
          {openTrades.length === 0 ? (
            <div className="bg-panel/40 border border-border rounded-lg p-6 text-center text-xs text-text-muted">
              No open paper positions. Bots open positions when matching signals fire on /trade.
            </div>
          ) : (
            <div className="bg-panel border border-border rounded-lg overflow-hidden">
              <Table
                rows={openTrades.map(t => buildOpenRow(t, bots, adapter.getTicker(t.marketId)?.price))}
                columns={['Market', 'Side', 'Entry', 'Mark', 'Size', 'PnL', 'Bot']}
              />
            </div>
          )}
        </div>

        {/* Per-market breakdown */}
        {marketRows.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-2">By market</h2>
            <div className="bg-panel border border-border rounded-lg overflow-hidden">
              <Table
                rows={marketRows.map(([marketId, agg]) => [
                  marketId,
                  String(agg.trades),
                  agg.openCount > 0
                    ? <span className="text-accent">{agg.openCount}</span>
                    : '—',
                  <span className={agg.pnl >= 0 ? 'text-long' : 'text-short'}>
                    {agg.pnl >= 0 ? '+' : ''}${formatUsd(agg.pnl)}
                  </span>,
                ])}
                columns={['Market', 'Total', 'Open', 'Realized']}
              />
            </div>
          </div>
        )}

        {/* Recent closed */}
        <div>
          <h2 className="text-sm font-semibold mb-2">Recent closed ({recentClosed.length})</h2>
          {recentClosed.length === 0 ? (
            <div className="bg-panel/40 border border-border rounded-lg p-6 text-center text-xs text-text-muted">
              No closed trades yet.
            </div>
          ) : (
            <div className="bg-panel border border-border rounded-lg overflow-hidden">
              <Table
                rows={recentClosed.map(t => [
                  t.marketId,
                  <DirectionBadge dir={t.direction} />,
                  `$${formatUsd(t.entryPrice)}`,
                  t.closePrice !== undefined ? `$${formatUsd(t.closePrice)}` : '—',
                  <span className={t.pnlUsd >= 0 ? 'text-long' : 'text-short'}>
                    {t.pnlUsd >= 0 ? '+' : ''}${formatUsd(t.pnlUsd)}
                  </span>,
                  new Date(t.closedAt).toLocaleString(),
                ])}
                columns={['Market', 'Side', 'Entry', 'Close', 'PnL', 'Closed']}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 text-xs">
          <Link
            to="/bots"
            className="flex items-center gap-1 text-accent hover:underline cursor-pointer"
          >
            Manage bots
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </section>
    </div>
  )
}

function buildOpenRow(
  t: BotTrade,
  bots: { id: string; name: string }[],
  mark: number | undefined,
): React.ReactNode[] {
  const liveMark = mark ?? t.entryPrice
  const sign = t.direction === 'long' ? 1 : -1
  const livePnl = sign * (liveMark - t.entryPrice) * t.size
  const botName = bots.find(b => b.id === t.botId)?.name ?? '—'
  return [
    t.marketId,
    <DirectionBadge dir={t.direction} />,
    `$${formatUsd(t.entryPrice)}`,
    `$${formatUsd(liveMark)}`,
    t.size.toFixed(6),
    <span className={livePnl >= 0 ? 'text-long' : 'text-short'}>
      {livePnl >= 0 ? '+' : ''}${formatUsd(livePnl)}
    </span>,
    <span className="text-text-muted truncate">{botName}</span>,
  ]
}

function BalanceList({
  state, priceOf, onAssetClick,
}: {
  state: VenueBalanceState | undefined
  priceOf: (asset: string) => number | undefined
  onAssetClick: (asset: string) => void
}) {
  if (!state) {
    return (
      <div className="text-[11px] text-text-muted mt-2">
        Loading balances…
      </div>
    )
  }
  if (state.error) {
    return (
      <div className="text-[11px] text-short mt-2">
        Failed to fetch: {state.error}
      </div>
    )
  }
  if (state.loading && !state.balances) {
    return (
      <div className="text-[11px] text-text-muted mt-2">Loading balances…</div>
    )
  }
  if (!state.balances || state.balances.length === 0) {
    return (
      <div className="text-[11px] text-text-muted mt-2">
        No non-zero balances on this account.
      </div>
    )
  }
  // Re-sort by USD value (stable = $1, non-stable = qty × ticker).
  // Holdings without a price fall to the bottom but stay in the list.
  const ranked = [...state.balances]
    .map(b => ({ b, usd: (priceOf(b.asset) ?? 0) * (b.free + b.locked) }))
    .sort((a, b) => b.usd - a.usd)
  const top = ranked.slice(0, 6)
  const rest = ranked.length - top.length
  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-1.5">
        {top.map(({ b, usd }) => (
          <button
            key={b.asset}
            onClick={() => onAssetClick(b.asset)}
            title={b.asset === 'USDT' ? '' : `Trade ${b.asset}/USDT`}
            disabled={b.asset === 'USDT'}
            className={cn(
              'flex items-center justify-between gap-2 px-2 py-1 rounded bg-surface/60 text-[11px] transition-colors text-left',
              b.asset === 'USDT' ? 'cursor-default' : 'hover:bg-panel-light cursor-pointer',
            )}
          >
            <span className="font-mono text-text-primary truncate">{b.asset}</span>
            <span className="text-right">
              <div className="font-mono tabular-nums text-text-secondary">
                {(b.free + b.locked).toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </div>
              {usd > 0 && (
                <div className="text-[9px] text-text-muted">${formatUsd(usd)}</div>
              )}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-text-muted">
        <span>{rest > 0 ? `+${rest} more` : `${state.balances.length} asset${state.balances.length === 1 ? '' : 's'}`}</span>
        {state.fetchedAt && (
          <span>Updated {new Date(state.fetchedAt).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  )
}

function DirectionBadge({ dir }: { dir: 'long' | 'short' }) {
  const isLong = dir === 'long'
  const Icon = isLong ? TrendingUp : TrendingDown
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider',
      isLong ? 'text-long' : 'text-short',
    )}>
      <Icon className="w-3 h-3" />
      {dir}
    </span>
  )
}

function Table({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface/60">
        <tr className="text-[10px] uppercase tracking-wider text-text-muted">
          {columns.map(c => (
            <th key={c} className="text-left font-medium px-3 py-2">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-border/40 hover:bg-panel-light transition-colors">
            {row.map((cell, j) => (
              <td key={j} className="px-3 py-2 font-mono tabular-nums truncate">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
