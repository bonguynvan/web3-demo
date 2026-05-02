/**
 * SignalSourcesModal — toggle per-user which signal sources fire.
 *
 * The toggles are presentation-only. The underlying compute layer
 * (including confluence) still has access to every source internally;
 * we just hide disabled ones from the panel, alerts, and bots.
 */

import { X, RotateCcw, Download, Trash2 } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useSignalSettingsStore, ALL_SOURCES } from '../store/signalSettingsStore'
import { useSignalThresholdsStore } from '../store/signalThresholdsStore'
import { useSignalPerformanceStore } from '../store/signalPerformanceStore'
import { cn } from '../lib/format'
import type { SignalSource } from '../signals/types'

interface Props {
  open: boolean
  onClose: () => void
}

const SOURCE_INFO: Record<SignalSource, { label: string; emoji: string; description: string }> = {
  funding: {
    label: 'Funding',
    emoji: '⚡',
    description: 'Funding-rate extremes on perp markets — long/short squeeze setups.',
  },
  crossover: {
    label: 'Crossover',
    emoji: '↗︎',
    description: 'EMA9/21 crossovers across the top markets by volume.',
  },
  rsi: {
    label: 'RSI',
    emoji: '🔄',
    description: 'Wilder RSI(14) crossing into overbought (≥70) or oversold (≤30) zones.',
  },
  volatility: {
    label: 'Volatility',
    emoji: '🚀',
    description: 'Latest bar range ≥3× the rolling 20-bar average — breakout candidates.',
  },
  whale: {
    label: 'Whale',
    emoji: '🐋',
    description: 'Live large-trade flow + on-chain whale-wallet position opens.',
  },
  confluence: {
    label: 'Confluence',
    emoji: '🎯',
    description: 'Synthesized when ≥2 distinct sources agree on direction. Top priority.',
  },
  news: {
    label: 'News',
    emoji: '📰',
    description: 'Important sentiment-leaning headlines from CryptoPanic (requires token).',
  },
  liquidation: {
    label: 'Liquidation',
    emoji: '💥',
    description: 'Forced position liquidations (not yet wired).',
  },
}

export function SignalSourcesModal({ open, onClose }: Props) {
  const enabled = useSignalSettingsStore(s => s.enabled)
  const toggle = useSignalSettingsStore(s => s.toggle)
  const setAll = useSignalSettingsStore(s => s.setAll)
  const thresholds = useSignalThresholdsStore(s => s.thresholds)
  const setThreshold = useSignalThresholdsStore(s => s.set)
  const resetThresholds = useSignalThresholdsStore(s => s.reset)
  const resolved = useSignalPerformanceStore(s => s.resolved)
  const statsBySource = new Map<SignalSource, { total: number; hits: number }>()
  for (const r of resolved) {
    const b = statsBySource.get(r.source) ?? { total: 0, hits: 0 }
    b.total += 1
    if (r.hit) b.hits += 1
    statsBySource.set(r.source, b)
  }

  return (
    <Modal open={open} onClose={onClose} title="Signal sources">
      <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        <div className="text-[11px] text-text-muted leading-relaxed">
          Toggle which sources fire in the live feed, alerts, and bot engine.
          Confluence still factors all sources internally regardless — these
          flags are presentation-only.
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setAll(true)}
            className="flex-1 py-1.5 text-[11px] font-medium rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          >
            Enable all
          </button>
          <button
            onClick={() => setAll(false)}
            className="flex-1 py-1.5 text-[11px] font-medium rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          >
            Disable all
          </button>
        </div>

        <div className="space-y-1.5 mb-1">
          {ALL_SOURCES.map(src => {
            const info = SOURCE_INFO[src]
            const on = enabled[src] !== false
            return (
              <label
                key={src}
                className={cn(
                  'flex items-start justify-between gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors',
                  on ? 'bg-surface/60' : 'bg-surface/30 opacity-60',
                  'hover:bg-panel-light',
                )}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-base shrink-0 mt-0.5">{info.emoji}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="text-xs font-medium text-text-primary">{info.label}</div>
                      {(() => {
                        const s = statsBySource.get(src)
                        if (!s || s.total === 0) return null
                        const rate = s.hits / s.total
                        const cls = rate >= 0.6
                          ? 'bg-long/15 text-long'
                          : rate >= 0.4
                            ? 'bg-surface text-text-secondary'
                            : 'bg-short/15 text-short'
                        return (
                          <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums', cls)}>
                            {Math.round(rate * 100)}% · {s.total}
                          </span>
                        )
                      })()}
                    </div>
                    <div className="text-[10px] text-text-muted leading-snug">{info.description}</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(src)}
                  className="w-4 h-4 accent-accent cursor-pointer shrink-0 mt-1"
                />
              </label>
            )
          })}
        </div>
        <div className="border-t border-border pt-4 mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-text-primary">Tune thresholds</div>
              <div className="text-[10px] text-text-muted">Adjust how aggressive each source is.</div>
            </div>
            <button
              onClick={resetThresholds}
              title="Reset to defaults"
              className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider rounded bg-surface border border-border text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>

          <Slider
            label="RSI overbought"
            value={thresholds.rsiOverbought}
            min={50} max={100} step={1}
            valueLabel={String(thresholds.rsiOverbought)}
            onChange={v => setThreshold('rsiOverbought', v)}
          />
          <Slider
            label="RSI oversold"
            value={thresholds.rsiOversold}
            min={0} max={50} step={1}
            valueLabel={String(thresholds.rsiOversold)}
            onChange={v => setThreshold('rsiOversold', v)}
          />
          <Slider
            label="Volatility multiple"
            value={thresholds.volatilityMultiple}
            min={1.5} max={6} step={0.5}
            valueLabel={`${thresholds.volatilityMultiple}×`}
            onChange={v => setThreshold('volatilityMultiple', v)}
          />
          <Slider
            label="Whale flow min skew"
            value={thresholds.whaleMinSkew}
            min={0} max={1} step={0.05}
            valueLabel={`${Math.round(thresholds.whaleMinSkew * 100)}%`}
            onChange={v => setThreshold('whaleMinSkew', v)}
          />
        </div>

        <PerformanceEmptyState />
        <DirectionStats />
        <MarketsLeaderboard />
        <RecentOutcomes />
      </div>

      <div className="flex justify-end px-4 pb-4">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-9 h-9 rounded-md bg-surface border border-border text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </Modal>
  )
}

function Slider({
  label, value, min, max, step, valueLabel, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  valueLabel: string
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] text-text-secondary">{label}</span>
        <span className="text-[11px] font-mono text-text-primary tabular-nums">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </label>
  )
}

function DirectionStats() {
  const resolved = useSignalPerformanceStore(s => s.resolved)
  if (resolved.length < 4) return null

  let longTotal = 0, longHits = 0, shortTotal = 0, shortHits = 0
  for (const r of resolved) {
    if (r.direction === 'long') {
      longTotal += 1
      if (r.hit) longHits += 1
    } else {
      shortTotal += 1
      if (r.hit) shortHits += 1
    }
  }
  if (longTotal < 2 || shortTotal < 2) return null

  const longRate = longHits / longTotal
  const shortRate = shortHits / shortTotal
  const skew = longRate - shortRate
  const regime = Math.abs(skew) < 0.1
    ? 'balanced'
    : skew > 0
      ? 'longs winning'
      : 'shorts winning'

  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-text-primary">Direction skew</div>
        <span className={cn(
          'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
          Math.abs(skew) < 0.1 ? 'bg-surface text-text-muted'
            : skew > 0 ? 'bg-long/15 text-long'
              : 'bg-short/15 text-short',
        )}>
          {regime}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div className="bg-surface/60 rounded px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-long mb-0.5">Long</div>
          <div className="font-mono tabular-nums text-text-primary">
            {Math.round(longRate * 100)}% <span className="text-text-muted">· {longTotal}</span>
          </div>
        </div>
        <div className="bg-surface/60 rounded px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-short mb-0.5">Short</div>
          <div className="font-mono tabular-nums text-text-primary">
            {Math.round(shortRate * 100)}% <span className="text-text-muted">· {shortTotal}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PerformanceEmptyState() {
  const pending = useSignalPerformanceStore(s => s.pending.length)
  const resolved = useSignalPerformanceStore(s => s.resolved.length)
  if (resolved > 0) return null

  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="text-xs font-medium text-text-primary mb-1">Performance stats</div>
      <div className="text-[11px] text-text-muted leading-relaxed">
        {pending === 0
          ? 'Once signals start firing, hit-rate stats and a market leaderboard appear here. Each fired signal resolves 30 minutes later against actual price movement.'
          : `${pending} signal${pending === 1 ? '' : 's'} pending — first stats appear in ~30 minutes once they resolve against current price.`}
      </div>
    </div>
  )
}

function RecentOutcomes() {
  const resolved = useSignalPerformanceStore(s => s.resolved)
  if (resolved.length === 0) return null

  const recent = [...resolved].sort((a, b) => b.closedAt - a.closedAt).slice(0, 5)

  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="text-xs font-medium text-text-primary mb-2">Recent outcomes</div>
      <div className="space-y-1">
        {recent.map(r => {
          const movePct = ((r.closePrice - r.entryPrice) / r.entryPrice) * 100
          const dirArrow = r.direction === 'long' ? '↑' : '↓'
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 text-[11px] bg-surface/60 rounded px-2 py-1.5"
            >
              <span className={cn(
                'shrink-0 w-5 text-center font-bold',
                r.hit ? 'text-long' : 'text-short',
              )}>
                {r.hit ? '✓' : '✗'}
              </span>
              <span className="font-mono text-text-primary truncate flex-1">{r.marketId}</span>
              <span className={cn(
                'font-mono shrink-0',
                r.direction === 'long' ? 'text-long' : 'text-short',
              )}>
                {dirArrow}
              </span>
              <span className="text-[10px] text-text-muted capitalize shrink-0 w-16 truncate text-right">
                {r.source}
              </span>
              <span className={cn(
                'font-mono tabular-nums shrink-0 w-14 text-right',
                movePct >= 0 ? 'text-long' : 'text-short',
              )}>
                {movePct >= 0 ? '+' : ''}{movePct.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function exportResolvedCsv(resolved: ReturnType<typeof useSignalPerformanceStore.getState>['resolved']): void {
  if (resolved.length === 0) return
  const header = 'triggeredAt,closedAt,source,marketId,direction,entryPrice,closePrice,pctMove,hit'
  const rows = resolved.map(r => {
    const move = ((r.closePrice - r.entryPrice) / r.entryPrice) * 100
    return [
      new Date(r.triggeredAt).toISOString(),
      new Date(r.closedAt).toISOString(),
      r.source,
      r.marketId,
      r.direction,
      r.entryPrice.toFixed(8),
      r.closePrice.toFixed(8),
      move.toFixed(4),
      r.hit ? '1' : '0',
    ].join(',')
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.href = url
  a.download = `signal-performance-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function MarketsLeaderboard() {
  const resolved = useSignalPerformanceStore(s => s.resolved)
  const clearPerf = useSignalPerformanceStore(s => s.clear)
  if (resolved.length < 3) return null

  const buckets = new Map<string, { total: number; hits: number }>()
  for (const r of resolved) {
    const b = buckets.get(r.marketId) ?? { total: 0, hits: 0 }
    b.total += 1
    if (r.hit) b.hits += 1
    buckets.set(r.marketId, b)
  }
  const ranked = Array.from(buckets.entries())
    .filter(([, b]) => b.total >= 2)
    .map(([marketId, b]) => ({ marketId, total: b.total, rate: b.hits / b.total }))
    .sort((a, b) => b.rate - a.rate)

  if (ranked.length === 0) return null

  const best = ranked.slice(0, 3)
  const worst = ranked.slice(-3).reverse().filter(w => !best.some(b => b.marketId === w.marketId))

  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="flex items-start justify-between mb-1 gap-2">
        <div>
          <div className="text-xs font-medium text-text-primary">Markets leaderboard</div>
          <div className="text-[10px] text-text-muted mb-2">
            Where signals have actually been right (≥2 resolutions per market).
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => exportResolvedCsv(resolved)}
            title="Download all resolved signals as CSV"
            className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider rounded bg-surface border border-border text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
          <button
            onClick={() => {
              if (confirm(`Clear all performance data? (${resolved.length} resolved signals will be lost.)`)) {
                clearPerf()
              }
            }}
            title="Clear all performance data"
            className="flex items-center justify-center w-7 h-7 rounded bg-surface border border-border text-text-muted hover:text-short hover:border-short/40 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <LeaderboardColumn title="Best" entries={best} tone="long" />
        {worst.length > 0 && <LeaderboardColumn title="Worst" entries={worst} tone="short" />}
      </div>
    </div>
  )
}

function LeaderboardColumn({
  title, entries, tone,
}: {
  title: string
  entries: { marketId: string; total: number; rate: number }[]
  tone: 'long' | 'short'
}) {
  const accent = tone === 'long' ? 'text-long' : 'text-short'
  return (
    <div>
      <div className={cn('text-[10px] uppercase tracking-wider mb-1', accent)}>{title}</div>
      <div className="space-y-1">
        {entries.map(e => (
          <div key={e.marketId} className="flex items-center justify-between gap-2 text-[11px] bg-surface/60 rounded px-2 py-1">
            <span className="font-mono text-text-primary truncate">{e.marketId}</span>
            <span className={cn('font-mono tabular-nums shrink-0', accent)}>
              {Math.round(e.rate * 100)}% · {e.total}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
