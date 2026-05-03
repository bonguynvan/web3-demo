/**
 * ActivityFeed — unified chronological event timeline.
 *
 * Merges paper-bot trades, venue fills (live), and resolved signals into
 * one newest-first feed. Pure presentational — caller passes the raw
 * sources, this just sorts and renders.
 *
 * The three event types share an `at: number` epoch ms timestamp so a
 * single sort produces the timeline.
 */

import { Bot, ArrowUpRight, ArrowDownRight, Zap, Wallet } from 'lucide-react'
import type { BotTrade } from '../bots/types'
import type { Fill, VenueId } from '../adapters/types'
import { cn, formatUsd } from '../lib/format'

export interface ActivityFeedProps {
  paperTrades: BotTrade[]
  venueFills: { venueId: VenueId; fill: Fill }[]
  resolvedSignals: Array<{ id: string; source: string; marketId: string; direction: 'long' | 'short'; closedAt: number; hit: boolean }>
  limit?: number
}

type Event =
  | { kind: 'paper-open'; at: number; trade: BotTrade }
  | { kind: 'paper-close'; at: number; trade: BotTrade & { closedAt: number } }
  | { kind: 'venue-fill'; at: number; venueId: VenueId; fill: Fill }
  | { kind: 'signal-resolved'; at: number; signal: ActivityFeedProps['resolvedSignals'][number] }

export function ActivityFeed({
  paperTrades, venueFills, resolvedSignals, limit = 30,
}: ActivityFeedProps) {
  const events: Event[] = []
  for (const t of paperTrades) {
    events.push({ kind: 'paper-open', at: t.openedAt, trade: t })
    if (t.closedAt) {
      events.push({ kind: 'paper-close', at: t.closedAt, trade: t as BotTrade & { closedAt: number } })
    }
  }
  for (const e of venueFills) {
    events.push({ kind: 'venue-fill', at: e.fill.timestamp, venueId: e.venueId, fill: e.fill })
  }
  for (const s of resolvedSignals) {
    events.push({ kind: 'signal-resolved', at: s.closedAt, signal: s })
  }
  events.sort((a, b) => b.at - a.at)
  const top = events.slice(0, limit)

  if (top.length === 0) {
    return (
      <div className="bg-panel/40 border border-border rounded-lg p-6 text-center text-xs text-text-muted">
        No activity yet. Open a paper trade or place a live order to see events here.
      </div>
    )
  }

  return (
    <div className="bg-panel border border-border rounded-lg divide-y divide-border/40">
      {top.map((e, i) => (
        <Row key={`${e.kind}-${e.at}-${i}`} event={e} />
      ))}
    </div>
  )
}

function Row({ event }: { event: Event }) {
  const time = new Date(event.at).toLocaleString()

  if (event.kind === 'venue-fill') {
    const { fill, venueId } = event
    const isBuy = fill.side === 'buy'
    const Icon = isBuy ? ArrowUpRight : ArrowDownRight
    return (
      <RowShell
        icon={<Wallet className="w-3.5 h-3.5 text-amber-400" />}
        title={
          <>
            <span className="text-amber-400 uppercase text-[10px] tracking-wider mr-2">{venueId}</span>
            <span className="font-mono">{fill.marketId}</span>
            <Icon className={cn('inline w-3 h-3 ml-1', isBuy ? 'text-long' : 'text-short')} />
            <span className={cn('uppercase text-[10px] tracking-wider ml-1 font-semibold', isBuy ? 'text-long' : 'text-short')}>
              {fill.side}
            </span>
          </>
        }
        detail={`${fill.size.toLocaleString(undefined, { maximumFractionDigits: 6 })} @ $${formatUsd(fill.price)} · fee ${fill.fee} ${fill.feeAsset}`}
        time={time}
      />
    )
  }

  if (event.kind === 'paper-open' || event.kind === 'paper-close') {
    const isOpen = event.kind === 'paper-open'
    const { trade } = event
    const isLong = trade.direction === 'long'
    const Icon = isLong ? ArrowUpRight : ArrowDownRight
    const pnl = !isOpen && trade.pnlUsd !== undefined ? trade.pnlUsd : null
    return (
      <RowShell
        icon={<Bot className={cn('w-3.5 h-3.5', isOpen ? 'text-accent' : pnl !== null && pnl >= 0 ? 'text-long' : 'text-short')} />}
        title={
          <>
            <span className={cn(
              'text-[10px] uppercase tracking-wider mr-2',
              isOpen ? 'text-accent' : 'text-text-muted',
            )}>
              {isOpen ? 'paper open' : 'paper close'}
            </span>
            <span className="font-mono">{trade.marketId}</span>
            <Icon className={cn('inline w-3 h-3 ml-1', isLong ? 'text-long' : 'text-short')} />
            <span className={cn('uppercase text-[10px] tracking-wider ml-1 font-semibold', isLong ? 'text-long' : 'text-short')}>
              {trade.direction}
            </span>
          </>
        }
        detail={isOpen
          ? `${trade.size.toFixed(6)} @ $${formatUsd(trade.entryPrice)} · $${formatUsd(trade.positionUsd)} notional`
          : `closed @ $${formatUsd(trade.closePrice ?? 0)}${pnl !== null ? ` · pnl ${pnl >= 0 ? '+' : ''}$${formatUsd(pnl)}` : ''}`}
        time={time}
      />
    )
  }

  // signal-resolved
  const { signal } = event
  return (
    <RowShell
      icon={<Zap className={cn('w-3.5 h-3.5', signal.hit ? 'text-long' : 'text-short')} />}
      title={
        <>
          <span className="text-[10px] uppercase tracking-wider mr-2 text-text-muted capitalize">{signal.source}</span>
          <span className="font-mono">{signal.marketId}</span>
          <span className={cn(
            'uppercase text-[10px] tracking-wider ml-1 font-semibold',
            signal.direction === 'long' ? 'text-long' : 'text-short',
          )}>
            {signal.direction}
          </span>
        </>
      }
      detail={signal.hit ? 'Hit ✓' : 'Miss ✗'}
      time={time}
    />
  )
}

function RowShell({
  icon, title, detail, time,
}: {
  icon: React.ReactNode
  title: React.ReactNode
  detail: string
  time: string
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs">{title}</div>
        <div className="text-[11px] text-text-muted truncate">{detail}</div>
      </div>
      <div className="shrink-0 text-[10px] text-text-muted">{time}</div>
    </div>
  )
}
