/**
 * PositionsTable — live workstation panel for open positions / orders / history.
 *
 * Three tabs read from the active live data sources:
 *   - Positions: open paper-bot trades (closedAt undefined). Mark price
 *     pulled from the active adapter's ticker cache so PnL is live.
 *   - Orders:    venue open orders (when a vault is unlocked + adapter is
 *     authenticated). Cancel-in-place button per row.
 *   - History:   closed bot trades + venue fills, merged newest-first.
 *
 * The pre-pivot demo arrays in `lib/demoData.ts` are no longer the source —
 * those were fed by the old on-chain order form, which has been removed.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Inbox, History as HistoryIcon, LineChart, ExternalLink, X } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useTradingStore } from '../store/tradingStore'
import { useVenueOpenOrders } from '../hooks/useVenueOpenOrders'
import { useVenueFills } from '../hooks/useVenueFills'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { getAdapter, getActiveAdapter, listAdapters } from '../adapters/registry'
import { useToast } from '../store/toastStore'
import { cn, formatUsd } from '../lib/format'
import type { BotTrade } from '../bots/types'
import type { Order, VenueId } from '../adapters/types'

type Tab = 'positions' | 'orders' | 'history'

const TICK_MS = 2_000

export function PositionsTable() {
  const trades = useBotStore(s => s.trades)
  const bots = useBotStore(s => s.bots)
  const setSelectedMarket = useTradingStore(s => s.setSelectedMarket)
  const selectedMarket = useTradingStore(s => s.selectedMarket.symbol)
  const vaultUnlocked = useVaultSessionStore(s => s.unlocked)
  const { states: orderStates } = useVenueOpenOrders()
  const { entries: fillEntries } = useVenueFills([selectedMarket])
  const toast = useToast()

  const [tab, setTab] = useState<Tab>('positions')

  // Heartbeat for live mark prices on open positions
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const openTrades = useMemo(
    () => trades
      .filter(t => t.closedAt === undefined)
      .sort((a, b) => b.openedAt - a.openedAt),
    [trades],
  )
  const closedTrades = useMemo(
    () => trades
      .filter(t => t.closedAt !== undefined)
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)),
    [trades],
  )

  // Flatten venue orders across authed venues
  const venueOrders = useMemo(() => {
    const out: { venueId: VenueId; order: Order }[] = []
    for (const venueId of Object.keys(orderStates) as VenueId[]) {
      const arr = orderStates[venueId]?.orders ?? []
      for (const order of arr) out.push({ venueId, order })
    }
    return out.sort((a, b) => b.order.createdAt - a.order.createdAt)
  }, [orderStates])

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      <div className="flex items-center border-b border-border px-1 shrink-0">
        <TabButton label="Positions" count={openTrades.length} active={tab === 'positions'} onClick={() => setTab('positions')} />
        <TabButton label="Orders" count={venueOrders.length} active={tab === 'orders'} onClick={() => setTab('orders')} />
        <TabButton label="History" count={closedTrades.length} active={tab === 'history'} onClick={() => setTab('history')} />
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'positions' && (
          openTrades.length === 0 ? (
            <EmptyState
              icon={<LineChart className="w-5 h-5" />}
              title="No open positions"
              subtitle="When a bot opens a paper trade or you place a live order, it shows up here."
            />
          ) : (
            <PositionsBody
              trades={openTrades}
              botName={(id: string) => bots.find(b => b.id === id)?.name ?? 'Bot'}
              onFocusMarket={(m) => setSelectedMarket(m)}
            />
          )
        )}

        {tab === 'orders' && (
          !vaultUnlocked ? (
            <EmptyState
              icon={<Inbox className="w-5 h-5" />}
              title="Vault locked"
              subtitle="Unlock a connected venue to see live open orders here."
            />
          ) : venueOrders.length === 0 ? (
            <EmptyState
              icon={<Inbox className="w-5 h-5" />}
              title="No live open orders"
              subtitle={`Connected venues: ${listAdapters().filter(a => (a as { isAuthenticated?: () => boolean }).isAuthenticated?.()).map(a => a.id).join(', ') || 'none'}.`}
            />
          ) : (
            <OrdersBody
              rows={venueOrders}
              onCancel={async (venueId, order) => {
                try {
                  await getAdapter(venueId)?.cancelOrder({ marketId: order.marketId, orderId: order.id })
                  toast.success('Order cancelled', `${venueId} · ${order.marketId}`)
                } catch (e) {
                  toast.error('Cancel failed', e instanceof Error ? e.message : 'unknown')
                }
              }}
            />
          )
        )}

        {tab === 'history' && (
          closedTrades.length === 0 && fillEntries.length === 0 ? (
            <EmptyState
              icon={<HistoryIcon className="w-5 h-5" />}
              title="No trade history"
              subtitle="Closed bot trades and venue fills appear here, newest first."
            />
          ) : (
            <HistoryBody
              closed={closedTrades}
              fills={fillEntries}
              botName={(id: string) => bots.find(b => b.id === id)?.name ?? 'Bot'}
              onFocusMarket={(m) => setSelectedMarket(m)}
            />
          )
        )}
      </div>
    </div>
  )
}

function TabButton({ label, count, active, onClick }: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 text-xs font-medium capitalize transition-colors cursor-pointer border-b-2',
        active ? 'text-text-primary border-accent' : 'text-text-muted border-transparent hover:text-text-secondary',
      )}
    >
      {label}
      {count > 0 && (
        <span className="ml-1.5 bg-accent-dim text-accent text-[10px] px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </button>
  )
}

function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2 py-6">
      <div className="w-12 h-12 rounded-full bg-surface/70 flex items-center justify-center text-text-muted">
        {icon}
      </div>
      <div className="text-xs text-text-secondary font-medium">{title}</div>
      <div className="text-[10px] text-text-muted leading-relaxed max-w-[280px]">{subtitle}</div>
    </div>
  )
}

function PositionsBody({
  trades, botName, onFocusMarket,
}: {
  trades: BotTrade[]
  botName: (id: string) => string
  onFocusMarket: (m: string) => void
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
          <th className="text-left px-3 py-2 font-medium">Market</th>
          <th className="text-left px-3 py-2 font-medium">Side</th>
          <th className="text-left px-3 py-2 font-medium">Bot</th>
          <th className="text-right px-3 py-2 font-medium">Size</th>
          <th className="text-right px-3 py-2 font-medium">Entry</th>
          <th className="text-right px-3 py-2 font-medium">Mark</th>
          <th className="text-right px-3 py-2 font-medium">PnL</th>
          <th className="text-right px-3 py-2 font-medium">Mode</th>
        </tr>
      </thead>
      <tbody>
        {trades.map(t => {
          const ticker = getActiveAdapter().getTicker(t.marketId)
          const mark = ticker?.price ?? t.entryPrice
          const sign = t.direction === 'long' ? 1 : -1
          const pnl = sign * (mark - t.entryPrice) * t.size
          const pnlPct = t.entryPrice > 0 ? (sign * (mark - t.entryPrice) / t.entryPrice) * 100 : 0

          return (
            <tr
              key={t.id}
              className="border-b border-border/50 hover:bg-panel-light transition-colors cursor-pointer"
              onClick={() => onFocusMarket(t.marketId)}
            >
              <td className="px-3 py-2.5 font-mono text-text-primary">{t.marketId}</td>
              <td className="px-3 py-2.5">
                <span className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
                  t.direction === 'long' ? 'bg-long-dim text-long' : 'bg-short-dim text-short',
                )}>
                  {t.direction}
                </span>
              </td>
              <td className="px-3 py-2.5 text-text-secondary truncate max-w-[120px]">{botName(t.botId)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(t.positionUsd)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(t.entryPrice)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(mark)}</td>
              <td className="px-3 py-2.5 text-right">
                <div className={cn('font-mono font-medium tabular-nums', pnl >= 0 ? 'text-long' : 'text-short')}>
                  {pnl >= 0 ? '+' : ''}${formatUsd(Math.abs(pnl))}
                </div>
                <div className={cn('text-[10px] font-mono', pnlPct >= 0 ? 'text-long' : 'text-short')}>
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                </div>
              </td>
              <td className="px-3 py-2.5 text-right">
                <span className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider',
                  t.mode === 'live' ? 'bg-amber-400/15 text-amber-400' : 'bg-surface text-text-muted',
                )}>
                  {t.mode === 'live' ? 'LIVE' : 'paper'}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function OrdersBody({
  rows, onCancel,
}: {
  rows: { venueId: VenueId; order: Order }[]
  onCancel: (venueId: VenueId, o: Order) => void
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
          <th className="text-left px-3 py-2 font-medium">Venue</th>
          <th className="text-left px-3 py-2 font-medium">Market</th>
          <th className="text-left px-3 py-2 font-medium">Side</th>
          <th className="text-right px-3 py-2 font-medium">Price</th>
          <th className="text-right px-3 py-2 font-medium">Size</th>
          <th className="text-right px-3 py-2 font-medium">Filled</th>
          <th className="text-right px-3 py-2 font-medium">Status</th>
          <th className="text-center px-3 py-2 font-medium" />
        </tr>
      </thead>
      <tbody>
        {rows.map(({ venueId, order }) => {
          const fillPct = order.size > 0 ? (order.filledSize / order.size) * 100 : 0
          return (
            <tr key={`${venueId}-${order.id}`} className="border-b border-border/50 hover:bg-panel-light transition-colors">
              <td className="px-3 py-2.5 capitalize text-text-secondary">{venueId}</td>
              <td className="px-3 py-2.5 font-mono text-text-primary">{order.marketId}</td>
              <td className="px-3 py-2.5">
                <span className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
                  order.side === 'buy' ? 'bg-long-dim text-long' : 'bg-short-dim text-short',
                )}>
                  {order.side}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-text-secondary">
                {order.price ? `$${formatUsd(order.price)}` : 'mkt'}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-text-secondary">{order.size}</td>
              <td className="px-3 py-2.5 text-right font-mono text-text-muted">{fillPct.toFixed(0)}%</td>
              <td className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted">{order.status}</td>
              <td className="px-3 py-2.5 text-center">
                <button
                  onClick={() => onCancel(venueId, order)}
                  title="Cancel order"
                  className="text-[10px] border px-2 py-1 rounded transition-colors cursor-pointer text-short border-short/30 hover:border-short/60 hover:bg-short-dim flex items-center gap-1 mx-auto"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

interface HistoryRow {
  key: string
  time: number
  market: string
  side: 'long' | 'short' | 'buy' | 'sell'
  size: number
  price: number
  source: 'bot' | 'venue'
  pnl?: number
  detail: string
}

function HistoryBody({
  closed, fills, botName, onFocusMarket,
}: {
  closed: BotTrade[]
  fills: { venueId: VenueId; fill: { id: string; marketId: string; side: 'buy' | 'sell'; price: number; size: number; timestamp: number } }[]
  botName: (id: string) => string
  onFocusMarket: (m: string) => void
}) {
  const rows = useMemo<HistoryRow[]>(() => {
    const out: HistoryRow[] = []
    for (const t of closed) {
      out.push({
        key: `bot-${t.id}`,
        time: t.closedAt ?? t.openedAt,
        market: t.marketId,
        side: t.direction,
        size: t.positionUsd,
        price: t.closePrice ?? t.entryPrice,
        source: 'bot',
        pnl: t.pnlUsd,
        detail: `${botName(t.botId)} · ${t.mode === 'live' ? 'LIVE' : 'paper'}`,
      })
    }
    for (const { venueId, fill } of fills) {
      out.push({
        key: `fill-${venueId}-${fill.id}`,
        time: fill.timestamp,
        market: fill.marketId,
        side: fill.side,
        size: fill.size * fill.price,
        price: fill.price,
        source: 'venue',
        detail: `${venueId} fill`,
      })
    }
    return out.sort((a, b) => b.time - a.time)
  }, [closed, fills, botName])

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
          <th className="text-left px-3 py-2 font-medium">When</th>
          <th className="text-left px-3 py-2 font-medium">Market</th>
          <th className="text-left px-3 py-2 font-medium">Side</th>
          <th className="text-left px-3 py-2 font-medium">Source</th>
          <th className="text-right px-3 py-2 font-medium">Notional</th>
          <th className="text-right px-3 py-2 font-medium">Price</th>
          <th className="text-right px-3 py-2 font-medium">PnL</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr
            key={r.key}
            className="border-b border-border/50 hover:bg-panel-light transition-colors cursor-pointer"
            onClick={() => onFocusMarket(r.market)}
          >
            <td className="px-3 py-2.5 text-text-muted font-mono tabular-nums">{relativeTime(Date.now() - r.time)}</td>
            <td className="px-3 py-2.5 font-mono text-text-primary">{r.market}</td>
            <td className="px-3 py-2.5">
              <span className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
                (r.side === 'long' || r.side === 'buy') ? 'bg-long-dim text-long' : 'bg-short-dim text-short',
              )}>
                {r.side}
              </span>
            </td>
            <td className="px-3 py-2.5 text-text-secondary">
              <span className="inline-flex items-center gap-1">
                {r.detail}
                {r.source === 'venue' && <ExternalLink className="w-3 h-3 text-text-muted" />}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(r.size)}</td>
            <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(r.price)}</td>
            <td className="px-3 py-2.5 text-right">
              {r.pnl != null ? (
                <span className={cn('font-mono tabular-nums', r.pnl >= 0 ? 'text-long' : 'text-short')}>
                  {r.pnl >= 0 ? '+' : ''}${formatUsd(Math.abs(r.pnl))}
                </span>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function relativeTime(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}
