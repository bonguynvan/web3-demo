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

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { TrendingUp, TrendingDown, Zap, Bell, BellOff, Send, SlidersHorizontal, X, Volume2, VolumeX, Pin, PinOff, ExternalLink, Lock, Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { ensureAudio, playSignalTone } from '../lib/signalSound'
import { venueTradeLink } from '../lib/venueLinks'
import { apiAvailable } from '../api/client'
import { useEntitlementStore } from '../store/entitlementStore'
import { deriveProState, isProSource } from '../lib/pro'
import { UpgradeModal } from './UpgradeModal'
import { Tooltip } from './ui/Tooltip'
import { explainSignalStreaming, followupStreaming, parseExplanation, type FollowupTurn } from '../api/ai'
import { useMutedMarketsStore } from '../store/mutedMarketsStore'

// Per-source teasers shown on hover over a locked signal card.
// Specific enough to make the upgrade feel concrete, vague enough to
// not give away the actual reading. Keep under ~120 chars so the
// tooltip stays compact.
const LOCKED_TEASER: Record<string, string> = {
  whale: 'A tracked wallet just opened or closed a $50k+ position on this market. Direction + size visible to Pro.',
  news:  'A market-moving headline just dropped tagged for this asset. Sentiment + source visible to Pro.',
}

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
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  // Shadow-mode Pro gate: when the backend is configured AND the user
  // is not Pro, signals from whale/news sources render locked instead
  // of revealing detail/direction. The gate is invisible in dev mode.
  const me = useEntitlementStore(s => s.data)
  const proGateActive = apiAvailable() && !deriveProState(me).active
  const isLocked = (src: import('../signals/types').SignalSource) =>
    proGateActive && isProSource(src)
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
  const mutedMarkets = useMutedMarketsStore(s => s.muted)
  const muteMarket = useMutedMarketsStore(s => s.mute)
  const clearMutedMarkets = useMutedMarketsStore(s => s.clear)
  const { signals, filteredOut } = useMemo(() => {
    const raw = allSignals.filter(s =>
      !dismissedIds.has(s.id)
      && s.confidence >= minConf
      && (soloSource === '' || s.source === soloSource)
      && !mutedMarkets.has(s.marketId)
    )
    // Pinned signals float to top regardless of sort
    const sorted = [
      ...raw.filter(s => pinned.has(s.id)),
      ...raw.filter(s => !pinned.has(s.id)),
    ]
    return { signals: sorted, filteredOut: allSignals.length - raw.length }
  }, [allSignals, minConf, soloSource, pinned, mutedMarkets])
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

      {mutedMarkets.size > 0 && (
        <button
          onClick={() => clearMutedMarkets()}
          title={`Click to unmute: ${Array.from(mutedMarkets).join(', ')}`}
          className="flex items-center justify-between gap-2 px-3 py-1 border-b border-border bg-surface/40 text-[10px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <VolumeX className="w-3 h-3" />
            {mutedMarkets.size} muted market{mutedMarkets.size === 1 ? '' : 's'}
          </span>
          <span className="uppercase tracking-[0.14em] text-accent">Clear</span>
        </button>
      )}

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
              locked={isLocked(s.source)}
              isPro={!proGateActive}
              onClick={() => handleClick(s)}
              onLockedClick={() => setUpgradeOpen(true)}
              onExplainGated={() => setUpgradeOpen(true)}
              onDismiss={() => dismiss(s.id)}
              onTogglePin={() => togglePin(s.id)}
              onMuteMarket={() => muteMarket(s.marketId)}
            />
          ))}
        </div>
      )}

      <SourceStatsStrip soloSource={soloSource} onSolo={updateSolo} />
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
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
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
      <img
        src="/signals-empty.png"
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        className="w-24 h-24 opacity-60 object-contain"
      />
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
  signal, now, isPinned, locked, isPro, onClick, onLockedClick, onExplainGated, onDismiss, onTogglePin, onMuteMarket,
}: {
  signal: Signal
  now: number
  isPinned: boolean
  locked: boolean
  isPro: boolean
  onClick: () => void
  onLockedClick: () => void
  onExplainGated: () => void
  onDismiss: () => void
  onTogglePin: () => void
  onMuteMarket: () => void
}) {
  if (locked) return <LockedSignalCard signal={signal} now={now} onClick={onLockedClick} />
  const isLong = signal.direction === 'long'
  const Arrow = isLong ? TrendingUp : TrendingDown
  const dirColor = isLong ? 'text-long' : 'text-short'
  const dirBg = isLong ? 'bg-long/10' : 'bg-short/10'
  const [explainState, setExplainState] = useState<
    | { kind: 'idle' }
    | { kind: 'streaming'; text: string }
    | { kind: 'ok'; text: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })
  // Follow-up Q&A — array of completed turns plus a draft input. The
  // most recent assistant turn is rendered partial while it streams.
  const [conversation, setConversation] = useState<FollowupTurn[]>([])
  const [draftQ, setDraftQ] = useState('')
  const [streamingAnswer, setStreamingAnswer] = useState<string | null>(null)
  const followingUp = streamingAnswer !== null

  const handleFollowup = (ev: React.FormEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
    const q = draftQ.trim()
    if (!q || followingUp || explainState.kind !== 'ok') return
    setDraftQ('')
    setStreamingAnswer('')
    const prevConvo = conversation
    followupStreaming(
      {
        signal_context: {
          signal_id: signal.id,
          source: signal.source,
          market_id: signal.marketId,
          direction: signal.direction,
          confidence: signal.confidence,
          title: signal.title,
          detail: signal.detail ?? '',
        },
        history: [
          { role: 'assistant', content: explainState.text },
          ...prevConvo,
        ],
        question: q,
      },
      {
        onChunk: chunk => setStreamingAnswer(curr => (curr ?? '') + chunk),
        onDone: full => {
          setConversation([
            ...prevConvo,
            { role: 'user', content: q },
            { role: 'assistant', content: full },
          ])
          setStreamingAnswer(null)
        },
        onError: message => {
          setConversation([
            ...prevConvo,
            { role: 'user', content: q },
            { role: 'assistant', content: `(error: ${message})` },
          ])
          setStreamingAnswer(null)
        },
      },
    )
  }

  const handleExplain = (ev: React.MouseEvent) => {
    ev.stopPropagation()
    if (!isPro) { onExplainGated(); return }
    if (explainState.kind === 'streaming') return
    setExplainState({ kind: 'streaming', text: '' })
    explainSignalStreaming(
      {
        signal_id: signal.id,
        source: signal.source,
        market_id: signal.marketId,
        direction: signal.direction,
        confidence: signal.confidence,
        title: signal.title,
        detail: signal.detail ?? '',
      },
      {
        onChunk: chunk => setExplainState(prev =>
          prev.kind === 'streaming' ? { kind: 'streaming', text: prev.text + chunk } : prev,
        ),
        onDone: full => setExplainState({ kind: 'ok', text: full }),
        onError: message => setExplainState({ kind: 'error', message }),
      },
    )
  }
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
          onClick={handleExplain}
          title={isPro ? 'Explain this signal with AI' : 'Pro: AI explainer — upgrade to enable'}
          aria-label="Explain signal"
          className={cn(
            'flex items-center justify-center w-5 h-5 rounded transition-opacity cursor-pointer',
            explainState.kind === 'ok'
              ? 'text-accent opacity-100'
              : 'text-text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-accent hover:bg-surface',
          )}
        >
          {explainState.kind === 'streaming'
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Sparkles className="w-3 h-3" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMuteMarket() }}
          title={`Mute ${signal.marketId} — hide all future signals from this market until you unmute it on the panel header`}
          aria-label={`Mute ${signal.marketId}`}
          className="flex items-center justify-center w-5 h-5 rounded text-text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-short hover:bg-surface transition-opacity cursor-pointer"
        >
          <VolumeX className="w-3 h-3" />
        </button>
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
            <a
              href={`/learn#${signal.source}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Learn how the ${signal.source} signal works`}
              className="flex items-center gap-1 hover:text-text-primary transition-colors"
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
              <span className="capitalize">{signal.source}</span>
            </a>
            <span>·</span>
            <span className="tabular-nums">{formatAge(ageMs)}</span>
          </div>
          {(() => {
            const link = venueTradeLink(signal.marketId, signal.venue)
            if (!link) return null
            return (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-[0.12em] text-accent border border-accent/40 hover:bg-accent-dim/30 transition-colors"
              >
                {link.label}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )
          })()}
          {(explainState.kind === 'streaming' || explainState.kind === 'ok') && (() => {
            const parsed = parseExplanation(explainState.text)
            const isStreaming = explainState.kind === 'streaming'
            return (
              <div className="mt-2 rounded-md border border-accent/30 bg-accent-dim/20 px-2.5 py-2 space-y-1.5 text-[11px] leading-snug">
                <div className="flex items-start gap-1.5">
                  <Sparkles className={cn(
                    'w-3 h-3 text-accent shrink-0 mt-0.5',
                    isStreaming && 'animate-pulse',
                  )} />
                  <span className="text-text-primary">
                    {parsed.explanation || (isStreaming ? <em className="text-text-muted">Generating…</em> : null)}
                    {isStreaming && parsed.explanation && (
                      <span className="inline-block w-1.5 h-3 ml-0.5 align-text-bottom bg-accent animate-pulse" />
                    )}
                  </span>
                </div>
                {parsed.risk && (
                  <div className="flex items-start gap-1.5 text-text-secondary">
                    <AlertCircle className="w-3 h-3 text-short shrink-0 mt-0.5" />
                    <span><span className="text-short font-semibold">Risk:</span> {parsed.risk}</span>
                  </div>
                )}
              </div>
            )
          })()}
          {explainState.kind === 'error' && (
            <div className="mt-2 text-[11px] text-short">
              Explainer failed: {explainState.message}
            </div>
          )}
          {explainState.kind === 'ok' && (
            <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>
              {conversation.map((turn, i) => (
                <div
                  key={i}
                  className={cn(
                    'text-[11px] leading-snug rounded px-2 py-1.5',
                    turn.role === 'user'
                      ? 'bg-surface/60 text-text-secondary'
                      : 'bg-accent-dim/15 text-text-primary',
                  )}
                >
                  <span className="text-[9px] uppercase tracking-[0.14em] font-mono text-text-muted mr-1.5">
                    {turn.role === 'user' ? 'you' : 'ai'}
                  </span>
                  {turn.content}
                </div>
              ))}
              {streamingAnswer !== null && (
                <div className="text-[11px] leading-snug rounded px-2 py-1.5 bg-accent-dim/15 text-text-primary">
                  <span className="text-[9px] uppercase tracking-[0.14em] font-mono text-text-muted mr-1.5">ai</span>
                  {streamingAnswer || <em className="text-text-muted">…</em>}
                  {streamingAnswer && (
                    <span className="inline-block w-1.5 h-3 ml-0.5 align-text-bottom bg-accent animate-pulse" />
                  )}
                </div>
              )}
              <form onSubmit={handleFollowup} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={draftQ}
                  onChange={e => setDraftQ(e.target.value)}
                  placeholder="Ask a follow-up…"
                  disabled={followingUp}
                  className="flex-1 bg-surface border border-border rounded px-2 py-1 text-[11px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted disabled:opacity-60"
                  onClick={e => e.stopPropagation()}
                  maxLength={500}
                />
                <button
                  type="submit"
                  disabled={followingUp || !draftQ.trim()}
                  className="px-2 py-1 rounded text-[10px] font-mono uppercase tracking-[0.14em] bg-accent text-surface hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Ask
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Shadow-mode card for premium-source signals when the user isn't Pro.
// We deliberately show the market, source, and age so the user can SEE
// signals are firing in real time — only the actionable parts
// (direction + detail + confidence) are obscured. Click opens the
// upgrade modal in the parent panel.
function LockedSignalCard({
  signal, now, onClick,
}: {
  signal: Signal
  now: number
  onClick: () => void
}) {
  const ageMs = Math.max(0, now - signal.triggeredAt)
  const teaser = LOCKED_TEASER[signal.source]
    ?? 'A premium-source signal fired here. Upgrade to see the direction, target, and confidence.'
  return (
    <Tooltip title="Pro signal — locked" content={teaser} side="bottom">
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 border-b border-border hover:bg-panel-light transition-colors cursor-pointer group"
    >
      <div className="flex items-start gap-2">
        <div className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-accent-dim text-accent group-hover:bg-accent group-hover:text-surface transition-colors">
          <Lock className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-text-primary">
              Pro signal
            </span>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
              {signal.source}
            </span>
            <span className="ml-auto inline-flex items-center gap-0.5 text-[9px] font-mono uppercase tracking-[0.14em] text-accent">
              <Sparkles className="w-2.5 h-2.5" />
              Unlock
            </span>
          </div>
          <div className="text-[11px] text-text-muted leading-snug select-none filter blur-[3px]">
            {signal.detail || 'Signal detail hidden — upgrade to see direction, target, and confidence.'}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
            <span className="font-mono">{signal.marketId}</span>
            <span>·</span>
            <span>conf <span className="filter blur-[2px]">**%</span></span>
            <span>·</span>
            <span className="tabular-nums">{formatAge(ageMs)}</span>
          </div>
        </div>
      </div>
    </button>
    </Tooltip>
  )
}
