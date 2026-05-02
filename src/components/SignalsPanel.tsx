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

import { useEffect, useRef, useState } from 'react'
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
import { TrendingUp, TrendingDown, Zap, Bell, BellOff, Send, SlidersHorizontal, X, Volume2, VolumeX, Pin, PinOff } from 'lucide-react'
import { ensureAudio, playSignalTone } from '../lib/signalSound'

// Dismissals are session-scoped — refreshing the page clears them so
// genuinely new fires of the same id can resurface. Stored in a Set
// outside React state to avoid stale-closure churn.
const dismissedIds = new Set<string>()
const DISMISS_EVENT = 'tc-signal-dismissed'

const PINNED_KEY = 'tc-signal-pinned-v1'
function loadPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch { return new Set() }
}
function savePinned(s: Set<string>): void {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify([...s])) } catch { /* full */ }
}

const SOLO_KEY = 'tc-signal-solo-source-v1'
function loadSolo(): string {
  try { return localStorage.getItem(SOLO_KEY) ?? '' } catch { return '' }
}

const SOUND_KEY = 'tc-signal-sound-v1'
const SOUND_MIN_CONF = 0.7
function loadSound(): boolean {
  try { return localStorage.getItem(SOUND_KEY) === 'true' } catch { return false }
}

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
  const [soundOn, setSoundOn] = useState(() => loadSound())
  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    try { localStorage.setItem(SOUND_KEY, String(next)) } catch { /* full */ }
    if (next) { ensureAudio(); playSignalTone('long') }
  }
  const [minConf, setMinConf] = useState(() => loadMinConf())
  const updateMinConf = (v: number) => {
    setMinConf(v)
    try { localStorage.setItem(MIN_CONF_KEY, String(v)) } catch { /* full */ }
  }
  const [pinned, setPinned] = useState<Set<string>>(() => loadPinned())
  const togglePin = (id: string) => {
    setPinned(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      savePinned(next)
      return next
    })
  }

  const [soloSource, setSoloSource] = useState(() => loadSolo())
  const updateSolo = (next: string) => {
    setSoloSource(next)
    try { localStorage.setItem(SOLO_KEY, next) } catch { /* full */ }
  }
  const signalsRaw = allSignals.filter(s =>
    !dismissedIds.has(s.id)
    && s.confidence >= minConf
    && (soloSource === '' || s.source === soloSource)
  )
  // Pinned signals float to top regardless of sort
  const signals = [
    ...signalsRaw.filter(s => pinned.has(s.id)),
    ...signalsRaw.filter(s => !pinned.has(s.id)),
  ]
  const filteredOut = allSignals.length - signalsRaw.length
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

  // Beep on newly-arrived high-confidence signals. Seed seenIds with
  // current ids on first sound-on transition so existing signals don't
  // all fire at once.
  const seenIdsRef = useRef<Set<string>>(new Set())
  const prevSoundOnRef = useRef<boolean>(soundOn)
  useEffect(() => {
    if (!soundOn) {
      prevSoundOnRef.current = false
      return
    }
    if (!prevSoundOnRef.current) {
      seenIdsRef.current = new Set(allSignals.map(s => s.id))
      prevSoundOnRef.current = true
      return
    }
    let played = false
    for (const s of allSignals) {
      if (seenIdsRef.current.has(s.id)) continue
      seenIdsRef.current.add(s.id)
      if (!played && s.confidence >= SOUND_MIN_CONF) {
        playSignalTone(s.direction)
        played = true
      }
    }
  }, [allSignals, soundOn])

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
            onClick={toggleSound}
            title={soundOn ? `Sound on (≥${Math.round(SOUND_MIN_CONF * 100)}% confidence)` : 'Sound off'}
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded transition-colors cursor-pointer',
              soundOn
                ? 'text-accent hover:bg-accent-dim/40'
                : 'text-text-muted hover:text-text-primary hover:bg-panel-light',
            )}
          >
            {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
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
              isPinned={pinned.has(s.id)}
              onClick={() => handleClick(s)}
              onDismiss={() => dismiss(s.id)}
              onTogglePin={() => togglePin(s.id)}
            />
          ))}
        </div>
      )}

      <SourceStatsStrip soloSource={soloSource} onSolo={updateSolo} />
    </div>
  )
}

function SourceStatsStrip({
  soloSource, onSolo,
}: {
  soloSource: string
  onSolo: (next: string) => void
}) {
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
        const isSolo = soloSource === source
        const cls = rate >= 0.6
          ? 'bg-long/15 text-long'
          : rate >= 0.4
            ? 'bg-surface text-text-secondary'
            : 'bg-short/15 text-short'
        return (
          <button
            key={source}
            onClick={() => onSolo(isSolo ? '' : source)}
            title={isSolo
              ? `Showing only ${source} — click to clear`
              : `${source}: ${Math.round(rate * 100)}% over ${total} resolved (click to solo)`}
            className={cn(
              'px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums capitalize transition-colors cursor-pointer',
              cls,
              isSolo ? 'ring-1 ring-accent' : 'hover:ring-1 hover:ring-border',
            )}
          >
            {source} {Math.round(rate * 100)}%
          </button>
        )
      })}
      {soloSource && (
        <button
          onClick={() => onSolo('')}
          className="ml-auto text-[9px] uppercase tracking-wider text-text-muted hover:text-text-primary cursor-pointer"
        >
          clear
        </button>
      )}
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
  signal, now, isPinned, onClick, onDismiss, onTogglePin,
}: {
  signal: Signal
  now: number
  isPinned: boolean
  onClick: () => void
  onDismiss: () => void
  onTogglePin: () => void
}) {
  const isLong = signal.direction === 'long'
  const Arrow = isLong ? TrendingUp : TrendingDown
  const dirColor = isLong ? 'text-long' : 'text-short'
  const dirBg = isLong ? 'bg-long/10' : 'bg-short/10'
  const isConfluence = signal.source === 'confluence'
  const ageMs = Math.max(0, now - signal.triggeredAt)
  const isNew = ageMs < 60_000
  const sourceDotClass: Record<string, string> = {
    funding: 'bg-amber-400',
    crossover: 'bg-sky-400',
    rsi: 'bg-fuchsia-400',
    volatility: 'bg-orange-400',
    whale: 'bg-cyan-400',
    liquidation: 'bg-rose-500',
    news: 'bg-emerald-400',
    confluence: 'bg-accent',
  }
  const dot = sourceDotClass[signal.source] ?? 'bg-text-muted'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={cn(
        'signal-enter group relative w-full text-left px-3 py-2.5 border-b border-border hover:bg-panel-light transition-colors cursor-pointer',
        isConfluence && 'border-l-2 border-l-accent bg-accent-dim/10',
      )}
    >
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin() }}
          title={isPinned ? 'Unpin' : 'Pin to top'}
          aria-label={isPinned ? 'Unpin signal' : 'Pin signal'}
          className={cn(
            'flex items-center justify-center w-5 h-5 rounded transition-opacity cursor-pointer',
            isPinned
              ? 'text-accent opacity-100'
              : 'text-text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-text-primary hover:bg-surface',
          )}
        >
          {isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          title="Dismiss"
          aria-label="Dismiss signal"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text-primary hover:bg-surface transition-opacity cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
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
            <span className="flex items-center gap-1">
              <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
              <span className="capitalize">{signal.source}</span>
            </span>
            <span>·</span>
            <span className="tabular-nums">{formatAge(ageMs)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
