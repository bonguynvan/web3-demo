/**
 * BotCard — single bot row in the BotsPanel list.
 *
 * Composed of:
 *   - BotNameEditor (double-click rename)
 *   - 4-stat grid (Total / Win / P&L / Open unrealized)
 *   - Per-bot equity sparkline
 *   - Collapsible recent fills (TradeRow + DetailLine)
 *
 * Pure presentational. Pulls live mark prices via the active venue
 * adapter — venue-agnostic.
 */

import { useState } from 'react'
import { Power, Trash2, Play, Share2, Check, ChevronDown, ChevronUp, XCircle, TrendingDown, GitFork } from 'lucide-react'
import { computeBotHealth } from '../lib/botHealth'
import { getActiveAdapter, getAdapter } from '../adapters/registry'
import { useTradingStore } from '../store/tradingStore'
import { useBotStore } from '../store/botStore'
import { useToast } from '../store/toastStore'
import type { BotConfig, BotTrade } from '../bots/types'
import { computeStats } from '../bots/computeStats'
import { profileBundle } from '../bots/riskProfiles'
import { JournalEntryEditor } from './JournalEntryEditor'
import { useJournalStore } from '../store/journalStore'
import { BookOpen } from 'lucide-react'
import { EquityCurve } from './EquityCurve'
import { cn, formatUsd } from '../lib/format'

interface BotCardProps {
  bot: BotConfig
  trades: BotTrade[]
  onToggle: () => void
  onRename: (name: string) => void
  onRemove: () => void
  onBacktest: () => void
  onShare: () => void
  onModeChange?: (mode: 'paper' | 'live') => void
  shared: boolean
}

export function BotCard({
  bot, trades, onToggle, onRename, onRemove, onBacktest, onShare, onModeChange, shared,
}: BotCardProps) {
  const adapter = getActiveAdapter()
  const forkBot = useBotStore(s => s.forkBot)
  const allBots = useBotStore(s => s.bots)
  const toast = useToast()
  const parentBot = bot.parentId && bot.parentKind === 'bot'
    ? allBots.find(b => b.id === bot.parentId)
    : null
  const stats = computeStats(trades, marketId => adapter.getTicker(marketId)?.price)
  const recent = trades.slice(0, 5)
  const pnlColor = stats.totalPnlUsd >= 0 ? 'text-long' : 'text-short'
  const closedSorted = trades
    .filter((t): t is BotTrade & { closedAt: number; pnlUsd: number } =>
      t.closedAt !== undefined && t.pnlUsd !== undefined)
    .sort((a, b) => a.closedAt - b.closedAt)
  const [tradesOpen, setTradesOpen] = useState(true)
  const [journalingId, setJournalingId] = useState<string | null>(null)

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

  const isLive = bot.mode === 'live'
  return (
    <div className={cn(
      'border-b border-border relative',
      stripeClass,
      isLive && 'ring-1 ring-inset ring-amber-400/30 bg-amber-400/[0.02]',
    )}>
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
              <HealthDot bot={bot} trades={trades} />
              <DriftBadge bot={bot} trades={trades} />
              <BotNameEditor name={bot.name} onRename={onRename} />
              <button
                disabled={!onModeChange}
                onClick={() => {
                  if (!onModeChange) return
                  if (bot.mode === 'paper') {
                    const maxExposure = bot.positionSizeUsd * bot.maxTradesPerDay
                    const msg = [
                      `Switch ${bot.name} to LIVE mode?`,
                      '',
                      'REAL orders will be placed on Binance when matching signals fire.',
                      '',
                      `Position size: $${bot.positionSizeUsd}/trade`,
                      `Daily cap: ${bot.maxTradesPerDay} trades`,
                      `Max daily exposure: $${maxExposure.toLocaleString()}`,
                      '',
                      'Guardrails: vault must be unlocked, API key must have trading scope, limit-only orders.',
                      '',
                      'Are you sure?',
                    ].join('\n')
                    if (confirm(msg)) {
                      onModeChange('live')
                    }
                  } else {
                    onModeChange('paper')
                  }
                }}
                title={onModeChange ? (bot.mode === 'paper' ? 'Switch to live (real orders)' : 'Switch back to paper') : ''}
                className={cn(
                  'text-[9px] uppercase tracking-wider px-1.5 py-px rounded font-semibold transition-colors',
                  bot.mode === 'live'
                    ? 'bg-amber-400/20 text-amber-400'
                    : 'bg-surface text-text-muted',
                  onModeChange && 'cursor-pointer hover:opacity-80',
                )}
              >
                {bot.mode}
              </button>
              {bot.riskProfile && bot.riskProfile !== 'custom' && (() => {
                const pb = profileBundle(bot.riskProfile)
                const Icon = pb.icon
                return (
                  <span
                    className={cn(
                      'text-[9px] uppercase tracking-wider px-1.5 py-px rounded font-semibold border inline-flex items-center gap-1',
                      pb.toneClass,
                    )}
                    title={pb.blurb}
                  >
                    <Icon className="w-2.5 h-2.5" />
                    {pb.label}
                  </span>
                )
              })()}
            </div>
            {parentBot && (
              <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1">
                <GitFork className="w-2.5 h-2.5" />
                <span>Forked from <span className="text-text-secondary">{parentBot.name}</span></span>
              </div>
            )}
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
            onClick={() => {
              const newId = forkBot(bot.id)
              if (newId) toast.success('Bot forked', `Created a copy of "${bot.name}". Tune it in the studio.`)
            }}
            title="Fork — create a tunable copy (paper mode, disabled by default)"
            className="shrink-0 w-6 h-6 rounded text-text-muted hover:text-accent hover:bg-accent-dim/30 flex items-center justify-center transition-colors cursor-pointer"
          >
            <GitFork className="w-3 h-3" />
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

        {/* Exit-reason breakdown — tells the operator where the edge
            actually comes from. A bot that mostly exits on hold-expired
            has no real edge; one that mostly hits TP has signal alpha. */}
        <ExitMix trades={closedSorted} />


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
                <TradeRow
                  key={t.id}
                  trade={t}
                  markPrice={adapter.getTicker(t.marketId)?.price}
                  stopLossPct={bot.stopLossPct}
                  onAnnotate={t.closedAt ? () => setJournalingId(t.id) : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}
      {journalingId && (
        <JournalEntryEditor
          tradeId={journalingId}
          trade={trades.find(t => t.id === journalingId)}
          onClose={() => setJournalingId(null)}
        />
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

function TradeRow({ trade, markPrice, stopLossPct, onAnnotate }: { trade: BotTrade; markPrice?: number; stopLossPct?: number; onAnnotate?: () => void }) {
  const journalEntry = useJournalStore(s => s.entries[trade.id])
  const isOpen = !trade.closedAt
  const liveMark = markPrice ?? trade.closePrice ?? trade.entryPrice
  const sign = trade.direction === 'long' ? 1 : -1
  const livePnl = trade.pnlUsd ?? sign * (liveMark - trade.entryPrice) * trade.size
  const pnlColor = livePnl >= 0 ? 'text-long' : 'text-short'
  const setSelectedMarket = useTradingStore(s => s.setSelectedMarket)
  const closeTrade = useBotStore(s => s.closeTrade)
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  const cancelLive = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!trade.venueOrderId) return
    if (!confirm(`Cancel live order ${trade.venueOrderId} on ${trade.marketId}? This kills the venue order AND closes the trade locally.`)) return
    const adapter = getAdapter('binance')
    if (!adapter) {
      toast.error('Cancel failed', 'Binance adapter unavailable')
      return
    }
    try {
      await adapter.cancelOrder({ marketId: trade.marketId, orderId: trade.venueOrderId })
      // Mark the local trade closed at entry price (no PnL realised since
      // we cancelled before the order filled).
      closeTrade(trade.id, trade.entryPrice, Date.now())
      toast.success('Live order canceled', `${trade.marketId} ${trade.venueOrderId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Cancel failed', msg)
    }
  }

  const movePct = ((liveMark - trade.entryPrice) / trade.entryPrice) * 100
  const holdMs = (trade.closedAt ?? Date.now()) - trade.openedAt
  const holdMin = Math.max(1, Math.round(holdMs / 60_000))
  const sourceFromSignal = trade.signalId.split(':')[0] || 'unknown'

  const ratio = Math.max(-1, Math.min(1, livePnl / Math.max(1, trade.positionUsd * 0.1)))
  const tintBucket = ratio === 0
    ? ''
    : ratio > 0
      ? Math.abs(ratio) > 0.5 ? 'bg-long/15' : 'bg-long/5'
      : Math.abs(ratio) > 0.5 ? 'bg-short/15' : 'bg-short/5'

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <div className={cn('flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-panel-light transition-colors', tintBucket)}>
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
          {trade.mode === 'live' && (
            <span className="text-[8px] uppercase tracking-wider px-1 py-px rounded bg-amber-400/15 text-amber-400 font-bold">
              live
            </span>
          )}
          <span className="font-mono text-text-muted">${formatUsd(trade.entryPrice)}</span>
          <span className={cn('font-mono w-16 text-right', pnlColor)}>
            {livePnl >= 0 ? '+' : ''}${formatUsd(livePnl)}
          </span>
          <span className="text-text-muted w-8 text-right">{isOpen ? 'open' : 'closed'}</span>
        </button>
        {isOpen && trade.mode === 'live' && trade.venueOrderId && (
          <button
            onClick={cancelLive}
            title="Cancel live venue order"
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-short hover:bg-short/10 cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        )}
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
          {(() => {
            // Surface the stop's current state so the user knows when
            // a trade has gone risk-free.
            const sl = stopLossPct
            if (trade.slMovedToBreakEven) {
              return <DetailLine label="Stop" value="at entry · BE armed" valueClass="text-amber-300" />
            }
            if (sl && sl > 0) {
              return <DetailLine label="Stop" value={`-${sl}%`} valueClass="text-text-muted" />
            }
            return null
          })()}
          <DetailLine label="Opened" value={new Date(trade.openedAt).toLocaleTimeString()} />
          {onAnnotate && (
            <div className="col-span-2 mt-1 pt-1 border-t border-border/40 flex items-center justify-between">
              <button
                onClick={(e) => { e.stopPropagation(); onAnnotate() }}
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer',
                  journalEntry ? 'text-accent hover:text-accent/80' : 'text-text-muted hover:text-text-primary',
                )}
              >
                <BookOpen className="w-3 h-3" />
                {journalEntry ? 'Edit journal entry' : 'Annotate'}
              </button>
              {journalEntry && journalEntry.tags.length > 0 && (
                <span className="text-[9px] font-mono text-text-muted truncate">
                  {journalEntry.tags.slice(0, 3).join(' · ')}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ExitMix — shows the % distribution of close reasons across the bot's
 * realized trades. A pro reading this can tell whether the edge came
 * from the signal (TP-heavy), whether stops protected the downside
 * (SL/BE catching the rest), or whether the bot is just churning
 * (hold_expired dominant).
 */
function ExitMix({ trades }: { trades: BotTrade[] }) {
  if (trades.length < 3) return null
  const counts: Record<string, number> = {}
  for (const t of trades) {
    const r = t.exitReason ?? 'hold_expired'
    counts[r] = (counts[r] ?? 0) + 1
  }
  // Display order: prefer TP first (success), then BE (defended), SL (lost),
  // trailing (locked), reversal (faded out), hold (expired without signal).
  const order: Array<{ key: string; label: string; tone: string }> = [
    { key: 'take_profit', label: 'TP', tone: 'text-long' },
    { key: 'trailing_stop', label: 'Trail', tone: 'text-long/70' },
    { key: 'break_even', label: 'BE', tone: 'text-amber-300' },
    { key: 'stop_loss', label: 'SL', tone: 'text-short' },
    { key: 'reversal', label: 'Rev', tone: 'text-text-muted' },
    { key: 'hold_expired', label: 'Hold', tone: 'text-text-muted' },
  ]
  const total = trades.length
  const segments = order
    .filter(o => (counts[o.key] ?? 0) > 0)
    .map(o => ({ ...o, n: counts[o.key], pct: (counts[o.key] / total) * 100 }))
  if (segments.length === 0) return null

  return (
    <div className="mt-2">
      <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1 font-mono">
        Exit mix
      </div>
      <div className="flex items-center gap-1 flex-wrap text-[10px] font-mono">
        {segments.map(seg => (
          <span key={seg.key} className={cn('inline-flex items-baseline gap-0.5', seg.tone)} title={`${seg.n} trades`}>
            <span className="font-semibold">{seg.label}</span>
            <span>{Math.round(seg.pct)}%</span>
          </span>
        )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`} className="text-text-muted">·</span>, el], [] as React.ReactNode[])}
      </div>
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

/**
 * HealthDot — at-a-glance status pill for a bot.
 *
 *   paused      → bot.enabled === false (user-disabled)
 *   running     → at least one open trade right now
 *   active 24h  → has closed at least one trade in the last day
 *   idle        → has trades but nothing in the last 24h
 *   fresh       → no trades ever (just configured)
 */
function HealthDot({ bot, trades }: { bot: BotConfig; trades: BotTrade[] }) {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000
  const now = Date.now()
  const open = trades.filter(t => t.closedAt === undefined)
  const recentClosed = trades.filter(t =>
    t.closedAt !== undefined && (t.closedAt ?? 0) >= now - ONE_DAY_MS,
  )

  let status: 'paused' | 'running' | 'active' | 'idle' | 'fresh'
  if (!bot.enabled) status = 'paused'
  else if (open.length > 0) status = 'running'
  else if (recentClosed.length > 0) status = 'active'
  else if (trades.length > 0) status = 'idle'
  else status = 'fresh'

  const TONE: Record<typeof status, { dot: string; label: string }> = {
    paused:  { dot: 'bg-text-muted',     label: 'Paused — toggle enable to resume.' },
    running: { dot: 'bg-long animate-pulse', label: `Running — ${open.length} open position${open.length === 1 ? '' : 's'}.` },
    active:  { dot: 'bg-long',           label: `Active — ${recentClosed.length} trade${recentClosed.length === 1 ? '' : 's'} closed in last 24h.` },
    idle:    { dot: 'bg-amber-400',      label: 'Idle — enabled but no signals matched in the last 24h.' },
    fresh:   { dot: 'bg-accent-dim',     label: 'Fresh — waiting for the first matching signal.' },
  }
  const t = TONE[status]

  return (
    <span title={t.label} className="shrink-0 inline-flex items-center" aria-label={t.label}>
      <span className={cn('w-2 h-2 rounded-full', t.dot)} />
    </span>
  )
}

/**
 * DriftBadge — visible only when the bot's recent win rate has
 * dropped meaningfully below its all-time baseline (see lib/botHealth).
 * The badge title carries the numbers; the visual is a small red
 * "trending down" pill so it doesn't compete with HealthDot.
 */
function DriftBadge({ bot, trades }: { bot: BotConfig; trades: BotTrade[] }) {
  const h = computeBotHealth(bot, trades)
  if (h.state !== 'drift') return null
  const allTime = Math.round(h.allTimeWR * 100)
  const recent = Math.round(h.recentWR * 100)
  const drop = allTime - recent
  return (
    <span
      title={`Drift: recent win rate ${recent}% across last ${h.windowSize} trades vs ${allTime}% all-time (${h.sample} resolved). Down ${drop} pp.`}
      className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-[0.14em] text-short bg-short/10 border border-short/30"
    >
      <TrendingDown className="w-2.5 h-2.5" />
      Drift
    </span>
  )
}
