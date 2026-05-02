/**
 * BotsPanel — list of paper-trading bots, their stats, and recent fills.
 *
 * For Phase B1, the only config UI is a power button (toggle enabled)
 * and a delete button. Editing thresholds happens via localStorage
 * directly until the form lands in B1.1.
 */

import { useEffect, useState } from 'react'
import { Bot, Power, Trash2, Plus, Play, BarChart3, Share2, Upload, Check, PauseCircle, PlayCircle, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useTradingStore } from '../store/tradingStore'
import { getActiveAdapter } from '../adapters/registry'
import { cn, formatUsd } from '../lib/format'
import { BotConfigForm } from './BotConfigForm'
import { BacktestModal } from './BacktestModal'
import { StrategyComparisonModal } from './StrategyComparisonModal'
import { BotImportModal } from './BotImportModal'
import { exportBot, copyToClipboard } from '../bots/portable'
import type { BotConfig, BotStats, BotTrade } from '../bots/types'

const STATS_TICK_MS = 5_000

type BotSort = 'created' | 'pnl' | 'winrate' | 'trades'
const SORT_KEY = 'tc-bots-sort-v1'
const SORT_OPTIONS: { value: BotSort; label: string }[] = [
  { value: 'created', label: 'Newest' },
  { value: 'pnl', label: 'P&L' },
  { value: 'winrate', label: 'Win rate' },
  { value: 'trades', label: 'Trades' },
]
function loadSort(): BotSort {
  try {
    const raw = localStorage.getItem(SORT_KEY)
    if (raw === 'pnl' || raw === 'winrate' || raw === 'trades' || raw === 'created') return raw
    return 'created'
  } catch { return 'created' }
}

function exportTradesCsv(trades: BotTrade[], bots: BotConfig[]): void {
  if (trades.length === 0) return
  const nameById = new Map(bots.map(b => [b.id, b.name]))
  const header = 'openedAt,closedAt,bot,marketId,direction,entryPrice,closePrice,size,positionUsd,pnlUsd,status'
  const rows = trades.map(t => [
    new Date(t.openedAt).toISOString(),
    t.closedAt ? new Date(t.closedAt).toISOString() : '',
    JSON.stringify(nameById.get(t.botId) ?? t.botId),
    t.marketId,
    t.direction,
    t.entryPrice.toFixed(8),
    t.closePrice?.toFixed(8) ?? '',
    t.size.toFixed(8),
    t.positionUsd.toFixed(2),
    t.pnlUsd?.toFixed(4) ?? '',
    t.closedAt ? 'closed' : 'open',
  ].join(','))
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.href = url
  a.download = `bot-trades-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function BotsPanel() {
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const toggleBot = useBotStore(s => s.toggleBot)
  const setAllEnabled = useBotStore(s => s.setAllEnabled)
  const renameBot = useBotStore(s => s.renameBot)
  const removeBot = useBotStore(s => s.removeBot)
  const clearClosedTrades = useBotStore(s => s.clearClosedTrades)
  const closedCount = trades.filter(t => t.closedAt !== undefined).length
  const anyEnabled = bots.some(b => b.enabled)

  const [sortBy, setSortBy] = useState<BotSort>(() => loadSort())
  const updateSort = (next: BotSort) => {
    setSortBy(next)
    try { localStorage.setItem(SORT_KEY, next) } catch { /* full */ }
  }
  const sortedBots = (() => {
    if (sortBy === 'created') return [...bots].sort((a, b) => b.createdAt - a.createdAt)
    const adapter = getActiveAdapter()
    const statFor = (b: BotConfig) => computeStats(
      trades.filter(t => t.botId === b.id),
      marketId => adapter.getTicker(marketId)?.price,
    )
    return [...bots].sort((a, b) => {
      const sa = statFor(a)
      const sb = statFor(b)
      if (sortBy === 'pnl') return sb.totalPnlUsd - sa.totalPnlUsd
      if (sortBy === 'trades') return sb.total - sa.total
      // winrate — bots below 3 closed trades sink to the bottom so a
      // single-trade 100% bot does not outrank a 50-trade 80% bot.
      const aQual = sa.closed >= 3
      const bQual = sb.closed >= 3
      if (aQual !== bQual) return aQual ? -1 : 1
      if (sb.winRate !== sa.winRate) return sb.winRate - sa.winRate
      return sb.closed - sa.closed
    })
  })()
  const [, force] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [backtestBot, setBacktestBot] = useState<BotConfig | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [sharedBotId, setSharedBotId] = useState<string | null>(null)

  const handleShare = async (b: BotConfig) => {
    const ok = await copyToClipboard(exportBot(b))
    if (ok) {
      setSharedBotId(b.id)
      setTimeout(() => setSharedBotId(prev => prev === b.id ? null : prev), 1800)
    }
  }

  // Heartbeat — drives unrealized PnL display from the adapter ticker
  // cache without forcing a sub for every market.
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), STATS_TICK_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-accent" />
          Paper bots
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">{bots.length} configured</span>
          {bots.length > 1 && (
            <select
              value={sortBy}
              onChange={(e) => updateSort(e.target.value as BotSort)}
              title="Sort bots (win rate requires ≥3 closed trades)"
              className="text-[10px] bg-surface border border-border rounded px-1.5 py-0.5 text-text-secondary cursor-pointer focus:outline-none focus:border-accent"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          {bots.length > 0 && (
            <button
              onClick={() => setAllEnabled(!anyEnabled)}
              title={anyEnabled ? 'Pause all bots' : 'Resume all bots'}
              className={cn(
                'flex items-center justify-center w-6 h-6 rounded transition-colors cursor-pointer',
                anyEnabled
                  ? 'text-text-muted hover:text-short hover:bg-short/10'
                  : 'text-long hover:bg-long/10',
              )}
            >
              {anyEnabled ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={() => setCompareOpen(true)}
            title="Compare strategies side-by-side"
            className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-accent hover:bg-accent-dim/30 transition-colors cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
          {trades.length > 0 && (
            <button
              onClick={() => exportTradesCsv(trades, bots)}
              title="Export bot trades as CSV"
              className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-accent hover:bg-accent-dim/30 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
          {closedCount > 0 && (
            <button
              onClick={() => {
                if (confirm(`Clear ${closedCount} closed trade${closedCount === 1 ? '' : 's'}? Open positions are kept.`)) {
                  clearClosedTrades()
                }
              }}
              title="Clear closed trades from ledger"
              className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-short hover:bg-short/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            title="Import bot from JSON"
            className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-accent hover:bg-accent-dim/30 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              title="Create new bot"
              className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-accent hover:bg-accent-dim/30 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {showForm && <BotConfigForm onClose={() => setShowForm(false)} />}
        {bots.length === 0 && !showForm ? (
          <EmptyState onCreate={() => setShowForm(true)} />
        ) : (
          <>
            <PortfolioSummary bots={bots} trades={trades} />
            {sortedBots.map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                trades={trades.filter(t => t.botId === bot.id)}
                onToggle={() => toggleBot(bot.id)}
                onRename={(name) => renameBot(bot.id, name)}
                onRemove={() => removeBot(bot.id)}
                onBacktest={() => setBacktestBot(bot)}
                onShare={() => handleShare(bot)}
                shared={sharedBotId === bot.id}
              />
            ))}
          </>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border shrink-0 text-[10px] text-text-muted leading-relaxed">
        Paper mode — trades are virtual until Phase 2d wallet trading lands.
      </div>

      {backtestBot && (
        <BacktestModal
          open={!!backtestBot}
          onClose={() => setBacktestBot(null)}
          bot={backtestBot}
        />
      )}
      <StrategyComparisonModal open={compareOpen} onClose={() => setCompareOpen(false)} />
      <BotImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-2">
      <Bot className="w-6 h-6 text-text-muted" />
      <span className="text-xs text-text-secondary">No bots configured</span>
      <span className="text-[10px] text-text-muted leading-relaxed max-w-[220px]">
        Bots auto-execute trades when matching signals fire. Run in paper mode
        to validate strategy before enabling live trading.
      </span>
      <button
        onClick={onCreate}
        className="mt-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
      >
        Create your first bot
      </button>
    </div>
  )
}

function BotCard({
  bot, trades, onToggle, onRename, onRemove, onBacktest, onShare, shared,
}: {
  bot: BotConfig
  trades: BotTrade[]
  onToggle: () => void
  onRename: (name: string) => void
  onRemove: () => void
  onBacktest: () => void
  onShare: () => void
  shared: boolean
}) {
  const adapter = getActiveAdapter()
  const stats = computeStats(trades, marketId => adapter.getTicker(marketId)?.price)
  const recent = trades.slice(0, 5)
  const pnlColor = stats.totalPnlUsd >= 0 ? 'text-long' : 'text-short'
  const closedSorted = trades
    .filter((t): t is BotTrade & { closedAt: number; pnlUsd: number } =>
      t.closedAt !== undefined && t.pnlUsd !== undefined)
    .sort((a, b) => a.closedAt - b.closedAt)
  const [tradesOpen, setTradesOpen] = useState(true)

  // Directional bias from realized PnL
  let longRealized = 0
  let shortRealized = 0
  for (const t of closedSorted) {
    if (t.direction === 'long') longRealized += t.pnlUsd
    else shortRealized += t.pnlUsd
  }
  const stripeClass = closedSorted.length < 3
    ? 'border-l-2 border-l-transparent'
    : Math.abs(longRealized - shortRealized) < 5
      ? 'border-l-2 border-l-border-light'
      : longRealized > shortRealized
        ? 'border-l-2 border-l-long'
        : 'border-l-2 border-l-short'

  return (
    <div className={cn('border-b border-border', stripeClass)}>
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
              <BotNameEditor name={bot.name} onRename={onRename} />
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-px rounded bg-surface text-text-muted">
                {bot.mode}
              </span>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {bot.allowedSources.length === 0 ? 'any source' : bot.allowedSources.join(' / ')}
              {' · '}min conf {Math.round(bot.minConfidence * 100)}%
              {' · '}${bot.positionSizeUsd}/trade
              {' · '}{bot.holdMinutes}m hold
              {(() => {
                const startOfToday = new Date()
                startOfToday.setHours(0, 0, 0, 0)
                const todayCount = trades.filter(t => t.openedAt >= startOfToday.getTime()).length
                const atCap = todayCount >= bot.maxTradesPerDay
                return (
                  <>
                    {' · '}
                    <span className={cn(atCap && 'text-short font-medium')}>
                      today {todayCount}/{bot.maxTradesPerDay}
                    </span>
                  </>
                )
              })()}
            </div>
          </div>
          <button
            onClick={onBacktest}
            title="Backtest this bot config against historical candles"
            className="shrink-0 w-6 h-6 rounded text-text-muted hover:text-accent hover:bg-accent-dim/30 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Play className="w-3 h-3" />
          </button>
          <button
            onClick={onShare}
            title={shared ? 'Copied to clipboard' : 'Copy portable JSON to clipboard'}
            className={cn(
              'shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer',
              shared
                ? 'text-long bg-long/10'
                : 'text-text-muted hover:text-accent hover:bg-accent-dim/30',
            )}
          >
            {shared ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
          </button>
          <button
            onClick={onRemove}
            title="Delete bot"
            className="shrink-0 w-6 h-6 rounded text-text-muted hover:text-short hover:bg-short/10 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-2">
          <Stat label="Total" value={`${stats.total}`} />
          <Stat label="Win rate" value={
            stats.closed > 0 ? `${Math.round(stats.winRate * 100)}%` : '—'
          } />
          <Stat
            label="P&L"
            value={`${stats.totalPnlUsd >= 0 ? '+' : ''}$${formatUsd(stats.totalPnlUsd)}`}
            valueClass={pnlColor}
          />
          <Stat
            label="Open"
            value={stats.open > 0
              ? `${stats.unrealizedPnlUsd >= 0 ? '+' : ''}$${formatUsd(stats.unrealizedPnlUsd)}`
              : '—'}
            valueClass={stats.open > 0
              ? (stats.unrealizedPnlUsd >= 0 ? 'text-long' : 'text-short')
              : undefined}
          />
        </div>

        {closedSorted.length >= 2 && (
          <div className="mt-2">
            <EquityCurve trades={closedSorted} height={28} />
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <>
          <button
            onClick={() => setTradesOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-1 text-[10px] text-text-muted hover:text-text-primary border-t border-border bg-surface/20 hover:bg-panel-light transition-colors cursor-pointer"
          >
            <span>{tradesOpen ? 'Hide' : 'Show'} recent ({recent.length})</span>
            {tradesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {tradesOpen && (
            <div className="border-t border-border bg-surface/30">
              {recent.map(t => (
                <TradeRow key={t.id} trade={t} markPrice={adapter.getTicker(t.marketId)?.price} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function BotNameEditor({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  if (!editing) {
    return (
      <button
        onDoubleClick={() => { setDraft(name); setEditing(true) }}
        title="Double-click to rename"
        className="text-xs font-medium text-text-primary truncate text-left hover:text-accent transition-colors cursor-text"
      >
        {name}
      </button>
    )
  }

  const commit = () => {
    onRename(draft)
    setEditing(false)
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(name); setEditing(false) }
      }}
      onClick={e => e.stopPropagation()}
      maxLength={60}
      className="text-xs font-medium text-text-primary bg-surface border border-border rounded px-1.5 py-0.5 outline-none focus:border-accent min-w-0 flex-1"
    />
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
  const setSelectedMarket = useTradingStore(s => s.setSelectedMarket)
  const [expanded, setExpanded] = useState(false)

  const movePct = ((liveMark - trade.entryPrice) / trade.entryPrice) * 100
  const holdMs = (trade.closedAt ?? Date.now()) - trade.openedAt
  const holdMin = Math.max(1, Math.round(holdMs / 60_000))
  const sourceFromSignal = trade.signalId.split(':')[0] || 'unknown'

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-panel-light transition-colors">
        <button
          onClick={() => setExpanded(e => !e)}
          title={expanded ? 'Hide details' : 'Show details'}
          className="shrink-0 w-4 h-4 flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        <button
          onClick={() => setSelectedMarket(trade.marketId)}
          title={`Focus ${trade.marketId} on the chart`}
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
        >
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
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-2 pt-1 bg-surface/40 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
          <DetailLine label="Source" value={sourceFromSignal} />
          <DetailLine label="Hold" value={`${holdMin}m`} />
          <DetailLine label="Size" value={`${trade.size.toFixed(6)} (${formatUsd(trade.positionUsd)} USD)`} />
          <DetailLine label="Mark" value={`$${formatUsd(liveMark)}`} />
          <DetailLine
            label="Move"
            value={`${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}%`}
            valueClass={movePct >= 0 ? 'text-long' : 'text-short'}
          />
          <DetailLine label="Opened" value={new Date(trade.openedAt).toLocaleTimeString()} />
        </div>
      )}
    </div>
  )
}

function DetailLine({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 truncate">
      <span className="text-text-muted">{label}</span>
      <span className={cn('font-mono tabular-nums truncate', valueClass ?? 'text-text-secondary')}>{value}</span>
    </div>
  )
}

function PortfolioSummary({ bots, trades }: { bots: BotConfig[]; trades: BotTrade[] }) {
  const adapter = getActiveAdapter()
  const stats = computeStats(trades, marketId => adapter.getTicker(marketId)?.price)
  const closedSorted = trades
    .filter((t): t is BotTrade & { closedAt: number; pnlUsd: number } =>
      t.closedAt !== undefined && t.pnlUsd !== undefined)
    .sort((a, b) => a.closedAt - b.closedAt)

  // Best / worst bot by total PnL
  let best: { name: string; pnl: number } | null = null
  let worst: { name: string; pnl: number } | null = null
  for (const bot of bots) {
    const botStats = computeStats(
      trades.filter(t => t.botId === bot.id),
      marketId => adapter.getTicker(marketId)?.price,
    )
    if (best === null || botStats.totalPnlUsd > best.pnl) {
      best = { name: bot.name, pnl: botStats.totalPnlUsd }
    }
    if (worst === null || botStats.totalPnlUsd < worst.pnl) {
      worst = { name: bot.name, pnl: botStats.totalPnlUsd }
    }
  }

  const pnlColor = stats.totalPnlUsd >= 0 ? 'text-long' : 'text-short'
  const realizedColor = stats.realizedPnlUsd >= 0 ? 'text-long' : 'text-short'
  const unrealizedColor = stats.unrealizedPnlUsd >= 0 ? 'text-long' : 'text-short'
  const enabledCount = bots.filter(b => b.enabled).length

  return (
    <div className="border-b border-border bg-surface/30 px-3 py-3">
      <div className="flex items-end justify-between mb-2">
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider">Portfolio P&L</div>
          <div className={cn('text-2xl font-mono font-bold tabular-nums', pnlColor)}>
            {stats.totalPnlUsd >= 0 ? '+' : ''}${formatUsd(stats.totalPnlUsd)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-text-muted uppercase tracking-wider">Win rate</div>
          <div className="text-lg font-mono text-text-primary tabular-nums">
            {stats.closed > 0 ? `${Math.round(stats.winRate * 100)}%` : '—'}
          </div>
        </div>
      </div>

      {closedSorted.length >= 2 && (
        <EquityCurve trades={closedSorted} className="mb-3" />
      )}

      <div className="grid grid-cols-4 gap-1.5 mb-3">
        <SmallStat
          label="Realized"
          value={`${stats.realizedPnlUsd >= 0 ? '+' : ''}$${formatUsd(stats.realizedPnlUsd)}`}
          valueClass={realizedColor}
        />
        <SmallStat
          label="Unrealized"
          value={`${stats.unrealizedPnlUsd >= 0 ? '+' : ''}$${formatUsd(stats.unrealizedPnlUsd)}`}
          valueClass={unrealizedColor}
        />
        <SmallStat label="Open" value={`${stats.open}`} />
        <SmallStat label="Closed" value={`${stats.closed}`} />
      </div>

      {(best || worst) && best?.name !== worst?.name && (
        <div className="flex items-center gap-2 text-[10px]">
          {best && (
            <div className="flex-1 bg-surface/50 rounded px-2 py-1 border border-border/60">
              <div className="text-text-muted">Top bot</div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-text-primary font-medium truncate">{best.name}</span>
                <span className={cn('font-mono', best.pnl >= 0 ? 'text-long' : 'text-short')}>
                  {best.pnl >= 0 ? '+' : ''}${formatUsd(best.pnl)}
                </span>
              </div>
            </div>
          )}
          {worst && (
            <div className="flex-1 bg-surface/50 rounded px-2 py-1 border border-border/60">
              <div className="text-text-muted">Worst</div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-text-primary font-medium truncate">{worst.name}</span>
                <span className={cn('font-mono', worst.pnl >= 0 ? 'text-long' : 'text-short')}>
                  {worst.pnl >= 0 ? '+' : ''}${formatUsd(worst.pnl)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-[10px] text-text-muted mt-2">
        {bots.length} bot{bots.length === 1 ? '' : 's'} · {enabledCount} active
      </div>
    </div>
  )
}

interface EquityCurveProps {
  trades: Array<BotTrade & { closedAt: number; pnlUsd: number }>
  className?: string
  height?: number
}

function EquityCurve({ trades, className, height = 36 }: EquityCurveProps) {
  // Build cumulative P&L series — start at 0 before the first close so the
  // line begins at the baseline.
  const series: { x: number; y: number }[] = [{ x: 0, y: 0 }]
  let cum = 0
  for (let i = 0; i < trades.length; i++) {
    cum += trades[i].pnlUsd
    series.push({ x: i + 1, y: cum })
  }

  const xs = series.map(p => p.x)
  const ys = series.map(p => p.y)
  const xMin = 0
  const xMax = Math.max(...xs)
  const yMin = Math.min(0, ...ys)
  const yMax = Math.max(0, ...ys)
  const yPad = (yMax - yMin) * 0.1 || 1

  // Project to a 100xH viewBox so we can stretch with width=100%
  const W = 100
  const H = height
  const project = (x: number, y: number) => ({
    px: xMax > xMin ? ((x - xMin) / (xMax - xMin)) * W : W / 2,
    py: H - ((y - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad))) * H,
  })

  const points = series.map(p => {
    const { px, py } = project(p.x, p.y)
    return `${px.toFixed(2)},${py.toFixed(2)}`
  }).join(' ')

  // Filled area under the line for visual weight
  const last = project(series[series.length - 1].x, series[series.length - 1].y)
  const first = project(series[0].x, series[0].y)
  const areaPath = `M ${first.px},${H} L ${points.replace(/,/g, ' ').replace(/  /g, ' ')} L ${last.px},${H} Z`

  // Zero baseline
  const zero = project(0, 0).py

  const final = ys[ys.length - 1]
  const positive = final >= 0
  const stroke = positive ? '#22c55e' : '#ef4444'
  const fill = positive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'

  return (
    <svg
      className={className}
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      {/* Zero baseline */}
      <line x1={0} y1={zero} x2={W} y2={zero} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="2 2" />
      {/* Filled area */}
      <path d={areaPath} fill={fill} />
      {/* Equity line */}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function SmallStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-surface/50 rounded px-2 py-1 border border-border/60">
      <div className="text-[9px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className={cn('text-[11px] font-mono mt-0.5 tabular-nums truncate', valueClass ?? 'text-text-primary')}>
        {value}
      </div>
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
