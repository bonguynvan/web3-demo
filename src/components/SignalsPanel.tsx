/**
 * SignalsPanel — live trading signals feed.
 *
 * Shows the highest-confidence signals first. Click a card to:
 *   - select that market in the store (so the chart switches)
 *   - pre-fill the order-form price with the suggested entry
 *
 * Phase S1 sources: funding extremes + EMA9/21 crossover. More to
 * come (liquidations, news, whales).
 */

import { useEffect, useState } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { useSignals } from '../hooks/useSignals'
import { useSignalPerformanceStore } from '../store/signalPerformanceStore'
import {
  getSignalAlertsEnabled,
  setSignalAlertsEnabled,
  ALERT_TOGGLE_EVENT,
} from '../hooks/useSignalAlerts'
import { TelegramConfigModal } from './TelegramConfigModal'
import { SignalSourcesModal } from './SignalSourcesModal'
import { cn } from '../lib/format'
import type { Signal } from '../signals/types'
import { TrendingUp, TrendingDown, Zap, Bell, BellOff, Send, SlidersHorizontal, X } from 'lucide-react'

// Dismissals are session-scoped — refreshing the page clears them so
// genuinely new fires of the same id can resurface. Stored in a Set
// outside React state to avoid stale-closure churn.
const dismissedIds = new Set<string>()
const DISMISS_EVENT = 'tc-signal-dismissed'

const MIN_CONF_KEY = 'tc-signal-min-conf-v1'
function loadMinConf(): number {
  try {
    const raw = localStorage.getItem(MIN_CONF_KEY)
    if (raw == null) return 0
    const n = Number(raw)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
  } catch { return 0 }
}

export function SignalsPanel() {
  const allSignals = useSignals()
  const setSelectedMarket = useTradingStore(s => s.setSelectedMarket)
  const setOrderPrice = useTradingStore(s => s.setOrderPrice)
  const setOrderSide = useTradingStore(s => s.setOrderSide)

  const [alertsEnabled, setAlertsEnabled] = useState(() => getSignalAlertsEnabled())
  const [telegramOpen, setTelegramOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [, forceRender] = useState(0)
  useEffect(() => {
    const sync = () => forceRender(n => n + 1)
    window.addEventListener(DISMISS_EVENT, sync)
    return () => window.removeEventListener(DISMISS_EVENT, sync)
  }, [])
  const [minConf, setMinConf] = useState(() => loadMinConf())
  const updateMinConf = (v: number) => {
    setMinConf(v)
    try { localStorage.setItem(MIN_CONF_KEY, String(v)) } catch { /* full */ }
  }
  const signals = allSignals.filter(s => !dismissedIds.has(s.id) && s.confidence >= minConf)
  const filteredOut = allSignals.length - signals.length
  const dismiss = (id: string) => {
    dismissedIds.add(id)
    window.dispatchEvent(new Event(DISMISS_EVENT))
  }
  // Sync if another tab/component flips the toggle
  useEffect(() => {
    const sync = () => setAlertsEnabled(getSignalAlertsEnabled())
    window.addEventListener(ALERT_TOGGLE_EVENT, sync)
    return () => window.removeEventListener(ALERT_TOGGLE_EVENT, sync)
  }, [])
  // Heartbeat so relative timestamps stay fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  const toggleAlerts = async () => {
    const next = !alertsEnabled
    await setSignalAlertsEnabled(next)
    setAlertsEnabled(next)
  }

  const handleClick = (s: Signal) => {
    setSelectedMarket(s.marketId)
    setOrderSide(s.direction === 'long' ? 'long' : 'short')
    if (s.suggestedPrice !== undefined) {
      setOrderPrice(s.suggestedPrice.toFixed(2))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-accent" />
          Live signals
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">{signals.length} active</span>
          <button
            onClick={toggleAlerts}
            title={alertsEnabled ? 'Alerts on — click to disable' : 'Alerts off — click to enable'}
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded transition-colors cursor-pointer',
              alertsEnabled
                ? 'text-accent hover:bg-accent-dim/40'
                : 'text-text-muted hover:text-text-primary hover:bg-panel-light',
            )}
          >
            {alertsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setTelegramOpen(true)}
            title="Configure Telegram alerts"
            className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setSourcesOpen(true)}
            title="Toggle signal sources"
            className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-text-muted shrink-0">Min conf</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={minConf}
          onChange={(e) => updateMinConf(Number(e.target.value))}
          className="flex-1 accent-accent"
        />
        <span className="text-[10px] font-mono tabular-nums text-text-secondary w-8 text-right">
          {Math.round(minConf * 100)}%
        </span>
        {filteredOut > 0 && (
          <span className="text-[10px] text-text-muted shrink-0">−{filteredOut}</span>
        )}
      </div>

      <TelegramConfigModal open={telegramOpen} onClose={() => setTelegramOpen(false)} />
      <SignalSourcesModal open={sourcesOpen} onClose={() => setSourcesOpen(false)} />

      {signals.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {signals.map(s => (
            <SignalCard
              key={s.id}
              signal={s}
              now={now}
              onClick={() => handleClick(s)}
              onDismiss={() => dismiss(s.id)}
            />
          ))}
        </div>
      )}

      <SourceStatsStrip />
    </div>
  )
}

function SourceStatsStrip() {
  const resolved = useSignalPerformanceStore(s => s.resolved)
  const pendingCount = useSignalPerformanceStore(s => s.pending.length)

  if (resolved.length === 0) {
    return (
      <div className="px-3 py-2 border-t border-border shrink-0 text-[10px] text-text-muted leading-relaxed">
        {pendingCount > 0
          ? `${pendingCount} signal${pendingCount === 1 ? '' : 's'} pending — win rates appear after 30min resolution.`
          : 'Click a signal to pre-fill the order form. Stats appear once signals resolve.'}
      </div>
    )
  }

  const buckets = new Map<string, { total: number; hits: number }>()
  for (const r of resolved) {
    const b = buckets.get(r.source) ?? { total: 0, hits: 0 }
    b.total += 1
    if (r.hit) b.hits += 1
    buckets.set(r.source, b)
  }
  const entries = Array.from(buckets.entries())
    .map(([source, b]) => ({ source, total: b.total, rate: b.hits / b.total }))
    .sort((a, b) => b.rate - a.rate)

  return (
    <div className="px-3 py-2 border-t border-border shrink-0 flex flex-wrap items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-wider text-text-muted">Win rate</span>
      {entries.map(({ source, total, rate }) => {
        const cls = rate >= 0.6
          ? 'bg-long/15 text-long'
          : rate >= 0.4
            ? 'bg-surface text-text-secondary'
            : 'bg-short/15 text-short'
        return (
          <span
            key={source}
            title={`${source}: ${Math.round(rate * 100)}% over ${total} resolved`}
            className={cn('px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums capitalize', cls)}
          >
            {source} {Math.round(rate * 100)}%
          </span>
        )
      })}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
      <Zap className="w-6 h-6 text-text-muted" />
      <span className="text-xs text-text-secondary">No signals firing right now</span>
      <span className="text-[10px] text-text-muted leading-relaxed max-w-[220px]">
        Signals appear as funding rates spike or moving averages cross.
        Switch venues or markets to see more.
      </span>
    </div>
  )
}

function formatAge(ms: number): string {
  if (ms < 60_000) return 'just now'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

function SignalCard({
  signal, now, onClick, onDismiss,
}: {
  signal: Signal
  now: number
  onClick: () => void
  onDismiss: () => void
}) {
  const isLong = signal.direction === 'long'
  const Arrow = isLong ? TrendingUp : TrendingDown
  const dirColor = isLong ? 'text-long' : 'text-short'
  const dirBg = isLong ? 'bg-long/10' : 'bg-short/10'
  const isConfluence = signal.source === 'confluence'
  const ageMs = Math.max(0, now - signal.triggeredAt)
  const isNew = ageMs < 60_000

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={cn(
        'group relative w-full text-left px-3 py-2.5 border-b border-border hover:bg-panel-light transition-colors cursor-pointer',
        isConfluence && 'border-l-2 border-l-accent bg-accent-dim/10',
      )}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        title="Dismiss"
        aria-label="Dismiss signal"
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text-primary hover:bg-surface transition-opacity cursor-pointer"
      >
        <X className="w-3 h-3" />
      </button>
      <div className="flex items-start gap-2">
        <div className={cn('shrink-0 w-7 h-7 rounded-md flex items-center justify-center', dirBg)}>
          <Arrow className={cn('w-3.5 h-3.5', dirColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-medium text-text-primary truncate">{signal.title}</span>
            <span className={cn('text-[10px] uppercase tracking-wider font-semibold', dirColor)}>
              {signal.direction}
            </span>
            {isNew && (
              <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent animate-pulse">
                new
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-muted leading-snug">
            {signal.detail}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
            <span className="font-mono">{signal.marketId}</span>
            <span>·</span>
            <span>conf {Math.round(signal.confidence * 100)}%</span>
            <span>·</span>
            <span className="capitalize">{signal.source}</span>
            <span>·</span>
            <span className="tabular-nums">{formatAge(ageMs)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
