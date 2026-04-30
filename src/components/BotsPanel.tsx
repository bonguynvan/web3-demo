/**
 * BotsPanel — list of paper-trading bots, their stats, and recent fills.
 *
 * For Phase B1, the only config UI is a power button (toggle enabled)
 * and a delete button. Editing thresholds happens via localStorage
 * directly until the form lands in B1.1.
 */

import { useEffect, useState } from 'react'
import { Bot, Power, Trash2 } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { getActiveAdapter } from '../adapters/registry'
import { cn, formatUsd } from '../lib/format'
import type { BotConfig, BotStats, BotTrade } from '../bots/types'

const STATS_TICK_MS = 5_000

export function BotsPanel() {
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const toggleBot = useBotStore(s => s.toggleBot)
  const removeBot = useBotStore(s => s.removeBot)
  const [, force] = useState(0)

  // Heartbeat — drives unrealized PnL display from the adapter ticker
  // cache without forcing a sub for every market.
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), STATS_TICK_MS)
    return () => clearInterval(id)
  }, [])

  if (bots.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-accent" />
          Paper bots
        </span>
        <span className="text-[10px] text-text-muted">{bots.length} configured</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {bots.map(bot => (
          <BotCard
            key={bot.id}
            bot={bot}
            trades={trades.filter(t => t.botId === bot.id)}
            onToggle={() => toggleBot(bot.id)}
            onRemove={() => removeBot(bot.id)}
          />
        ))}
      </div>

      <div className="px-3 py-2 border-t border-border shrink-0 text-[10px] text-text-muted leading-relaxed">
        Paper mode — trades are virtual until Phase 2d wallet trading lands.
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-2">
      <Bot className="w-6 h-6 text-text-muted" />
      <span className="text-xs text-text-secondary">No bots configured</span>
      <span className="text-[10px] text-text-muted leading-relaxed max-w-[220px]">
        Bots auto-execute trades when matching signals fire. Run in paper mode
        to validate strategy before enabling live trading.
      </span>
    </div>
  )
}

function BotCard({
  bot, trades, onToggle, onRemove,
}: {
  bot: BotConfig
  trades: BotTrade[]
  onToggle: () => void
  onRemove: () => void
}) {
  const adapter = getActiveAdapter()
  const stats = computeStats(trades, marketId => adapter.getTicker(marketId)?.price)
  const recent = trades.slice(0, 5)
  const pnlColor = stats.totalPnlUsd >= 0 ? 'text-long' : 'text-short'

  return (
    <div className="border-b border-border">
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          <button
            onClick={onToggle}
            title={bot.enabled ? 'Pause bot' : 'Activate bot'}
            className={cn(
              'shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer',
              bot.enabled
                ? 'bg-long/15 text-long hover:bg-long/25'
                : 'bg-surface text-text-muted hover:text-text-primary',
            )}
          >
            <Power className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-primary truncate">{bot.name}</span>
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-px rounded bg-surface text-text-muted">
                {bot.mode}
              </span>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {bot.allowedSources.length === 0 ? 'any source' : bot.allowedSources.join(' / ')}
              {' · '}min conf {Math.round(bot.minConfidence * 100)}%
              {' · '}${bot.positionSizeUsd}/trade
              {' · '}{bot.holdMinutes}m hold
            </div>
          </div>
          <button
            onClick={onRemove}
            title="Delete bot"
            className="shrink-0 w-6 h-6 rounded text-text-muted hover:text-short hover:bg-short/10 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-2">
          <Stat label="Total" value={`${stats.total}`} />
          <Stat label="Win rate" value={
            stats.closed > 0 ? `${Math.round(stats.winRate * 100)}%` : '—'
          } />
          <Stat
            label="P&L"
            value={`${stats.totalPnlUsd >= 0 ? '+' : ''}$${formatUsd(stats.totalPnlUsd)}`}
            valueClass={pnlColor}
          />
        </div>
      </div>

      {recent.length > 0 && (
        <div className="border-t border-border bg-surface/30">
          {recent.map(t => (
            <TradeRow key={t.id} trade={t} markPrice={adapter.getTicker(t.marketId)?.price} />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-surface/50 rounded px-2 py-1.5 border border-border/60">
      <div className="text-[9px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className={cn('text-xs font-mono mt-0.5', valueClass ?? 'text-text-primary')}>
        {value}
      </div>
    </div>
  )
}

function TradeRow({ trade, markPrice }: { trade: BotTrade; markPrice?: number }) {
  const isOpen = !trade.closedAt
  const liveMark = markPrice ?? trade.closePrice ?? trade.entryPrice
  const sign = trade.direction === 'long' ? 1 : -1
  const livePnl = trade.pnlUsd ?? sign * (liveMark - trade.entryPrice) * trade.size
  const pnlColor = livePnl >= 0 ? 'text-long' : 'text-short'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] border-b border-border/40 last:border-b-0">
      <span className={cn(
        'font-semibold uppercase tracking-wider',
        trade.direction === 'long' ? 'text-long' : 'text-short',
      )}>
        {trade.direction[0]}
      </span>
      <span className="font-mono text-text-secondary truncate flex-1">{trade.marketId}</span>
      <span className="font-mono text-text-muted">${formatUsd(trade.entryPrice)}</span>
      <span className={cn('font-mono w-16 text-right', pnlColor)}>
        {livePnl >= 0 ? '+' : ''}${formatUsd(livePnl)}
      </span>
      <span className="text-text-muted w-8 text-right">{isOpen ? 'open' : 'closed'}</span>
    </div>
  )
}

function computeStats(trades: BotTrade[], getMark: (id: string) => number | undefined): BotStats {
  let realizedPnl = 0
  let unrealizedPnl = 0
  let wins = 0
  let losses = 0
  let open = 0
  let closed = 0

  for (const t of trades) {
    if (t.closedAt && t.pnlUsd !== undefined) {
      closed++
      realizedPnl += t.pnlUsd
      if (t.pnlUsd >= 0) wins++
      else losses++
    } else {
      open++
      const mark = getMark(t.marketId) ?? t.entryPrice
      const sign = t.direction === 'long' ? 1 : -1
      unrealizedPnl += sign * (mark - t.entryPrice) * t.size
    }
  }

  return {
    total: trades.length,
    open,
    closed,
    wins,
    losses,
    winRate: closed > 0 ? wins / closed : 0,
    totalPnlUsd: realizedPnl + unrealizedPnl,
    realizedPnlUsd: realizedPnl,
    unrealizedPnlUsd: unrealizedPnl,
  }
}
