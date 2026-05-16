/**
 * BotConfigForm — inline form to create a new paper-trading bot.
 *
 * All fields have sensible defaults so the user can save immediately
 * for a working baseline. Live mode is disabled — Phase 2d wallet
 * trading must land before this option becomes selectable.
 */

import { useState } from 'react'
import { X } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useRiskStore } from '../store/riskStore'
import { useTradingStore } from '../store/tradingStore'
import { BOT_TEMPLATES, type BotTemplate } from '../bots/templates'
import { RISK_PROFILES, RISK_PROFILE_ORDER } from '../bots/riskProfiles'
import { runBacktest, type BacktestResult } from '../bots/backtest'
import { cn, formatUsd } from '../lib/format'
import type { SignalSource } from '../signals/types'
import type { BotRiskProfile, BotConfig } from '../bots/types'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

const SOURCE_OPTIONS: SignalSource[] = [
  'confluence', 'funding', 'crossover', 'rsi', 'volatility', 'whale',
]

interface FormState {
  name: string
  allowedSources: SignalSource[]
  allowedMarkets: string[]
  minConfidence: number    // 0..100 in form, normalized on save
  positionSizeUsd: number
  holdMinutes: number
  maxTradesPerDay: number
  /** All four risk-exit percents are positive numbers; 0 = disabled. */
  stopLossPct: number
  takeProfitPct: number
  trailingStopPct: number
  breakEvenAtPct: number
  /** Multi-target TPs. 0 = single-TP mode (takeProfitPct used as the only TP). */
  tp1Pct: number
  tp1ClosePct: number
  tp2Pct: number
  /** Tracks which profile chip is highlighted. Auto-flips to 'custom' on edit. */
  riskProfile: BotRiskProfile
  /** Sizing mode + risk-percent fields — see BotConfig docs. */
  sizingMode: 'fixed_usd' | 'risk_pct'
  riskPctPerTrade: number
}

const DEFAULT_FORM: FormState = {
  name: 'New Bot',
  allowedSources: ['confluence'],
  allowedMarkets: [],
  minConfidence: 60,
  positionSizeUsd: 100,
  holdMinutes: 60,
  maxTradesPerDay: 10,
  stopLossPct: 2,
  takeProfitPct: 4,
  trailingStopPct: 1,
  breakEvenAtPct: 0,
  tp1Pct: 0,
  tp1ClosePct: 50,
  tp2Pct: 0,
  riskProfile: 'balanced',
  sizingMode: 'fixed_usd',
  riskPctPerTrade: 0.5,
}

export function BotConfigForm({ onClose }: { onClose: () => void }) {
  const addBot = useBotStore(s => s.addBot)
  const accountEquityUsd = useRiskStore(s => s.accountEquityUsd)
  const setRiskLimits = useRiskStore(s => s.setLimits)
  const markets = useTradingStore(s => s.markets)
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const candles = useTradingStore(s => s.candles)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)
  const [preview, setPreview] = useState<BacktestResult | null>(null)

  const runPreview = () => {
    if (candles.length < 50) {
      setPreview(null)
      return
    }
    // Build a transient BotConfig snapshot from the current form. The
    // backtest is pure — nothing escapes this component.
    const cfg: BotConfig = {
      id: 'preview',
      name: form.name,
      enabled: true,
      mode: 'paper',
      allowedSources: form.allowedSources,
      allowedMarkets: form.allowedMarkets,
      minConfidence: Math.max(0, Math.min(1, form.minConfidence / 100)),
      positionSizeUsd: form.positionSizeUsd,
      holdMinutes: form.holdMinutes,
      maxTradesPerDay: form.maxTradesPerDay,
      stopLossPct: form.stopLossPct > 0 ? form.stopLossPct : undefined,
      takeProfitPct: form.takeProfitPct > 0 ? form.takeProfitPct : undefined,
      trailingStopPct: form.trailingStopPct > 0 ? form.trailingStopPct : undefined,
      breakEvenAtPct: form.breakEvenAtPct > 0 ? form.breakEvenAtPct : undefined,
      tp1Pct: form.tp1Pct > 0 ? form.tp1Pct : undefined,
      tp1ClosePct: form.tp1Pct > 0 ? form.tp1ClosePct : undefined,
      tp2Pct: form.tp2Pct > 0 ? form.tp2Pct : undefined,
      riskProfile: form.riskProfile,
      createdAt: Date.now(),
    }
    setPreview(runBacktest(cfg, selectedMarket.symbol, candles))
  }

  const applyProfile = (profile: Exclude<BotRiskProfile, 'custom'>) => {
    const b = RISK_PROFILES[profile].defaults
    setActiveTemplate(null)
    setForm(f => ({
      ...f,
      minConfidence: Math.round(b.minConfidence * 100),
      positionSizeUsd: b.positionSizeUsd,
      holdMinutes: b.holdMinutes,
      maxTradesPerDay: b.maxTradesPerDay,
      stopLossPct: b.stopLossPct,
      takeProfitPct: b.takeProfitPct,
      trailingStopPct: b.trailingStopPct,
      breakEvenAtPct: b.breakEvenAtPct,
      riskProfile: profile,
    }))
  }

  /** Wrap any single-field setter so the profile auto-flips to 'custom'. */
  const onTune = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [key]: value, riskProfile: 'custom' }))
  }

  const applyTemplate = (tpl: BotTemplate) => {
    setActiveTemplate(tpl.id)
    setForm(f => ({
      ...f,
      name: tpl.name,
      allowedSources: tpl.config.allowedSources,
      minConfidence: Math.round(tpl.config.minConfidence * 100),
      positionSizeUsd: tpl.config.positionSizeUsd,
      holdMinutes: tpl.config.holdMinutes,
      maxTradesPerDay: tpl.config.maxTradesPerDay,
      stopLossPct: tpl.config.stopLossPct ?? f.stopLossPct,
      takeProfitPct: tpl.config.takeProfitPct ?? f.takeProfitPct,
      trailingStopPct: tpl.config.trailingStopPct ?? f.trailingStopPct,
      breakEvenAtPct: tpl.config.breakEvenAtPct ?? 0,
      tp1Pct: tpl.config.tp1Pct ?? 0,
      tp1ClosePct: tpl.config.tp1ClosePct ?? 50,
      tp2Pct: tpl.config.tp2Pct ?? 0,
    }))
  }

  const toggleSource = (source: SignalSource) => {
    setForm(f => ({
      ...f,
      allowedSources: f.allowedSources.includes(source)
        ? f.allowedSources.filter(s => s !== source)
        : [...f.allowedSources, source],
    }))
  }

  const toggleMarket = (symbol: string) => {
    setForm(f => ({
      ...f,
      allowedMarkets: f.allowedMarkets.includes(symbol)
        ? f.allowedMarkets.filter(m => m !== symbol)
        : [...f.allowedMarkets, symbol],
    }))
  }

  const handleSave = () => {
    if (!form.name.trim()) return
    if (form.positionSizeUsd <= 0) return
    if (form.holdMinutes <= 0) return
    addBot({
      name: form.name.trim(),
      enabled: true,
      mode: 'paper',
      allowedSources: form.allowedSources,
      allowedMarkets: form.allowedMarkets,
      minConfidence: Math.max(0, Math.min(1, form.minConfidence / 100)),
      positionSizeUsd: form.positionSizeUsd,
      holdMinutes: form.holdMinutes,
      maxTradesPerDay: form.maxTradesPerDay,
      stopLossPct: form.stopLossPct > 0 ? form.stopLossPct : undefined,
      takeProfitPct: form.takeProfitPct > 0 ? form.takeProfitPct : undefined,
      trailingStopPct: form.trailingStopPct > 0 ? form.trailingStopPct : undefined,
      breakEvenAtPct: form.breakEvenAtPct > 0 ? form.breakEvenAtPct : undefined,
      tp1Pct: form.tp1Pct > 0 ? form.tp1Pct : undefined,
      tp1ClosePct: form.tp1Pct > 0 ? form.tp1ClosePct : undefined,
      tp2Pct: form.tp2Pct > 0 ? form.tp2Pct : undefined,
      riskProfile: form.riskProfile,
      sizingMode: form.sizingMode,
      riskPctPerTrade: form.sizingMode === 'risk_pct' && form.riskPctPerTrade > 0 ? form.riskPctPerTrade : undefined,
    })
    onClose()
  }

  return (
    <div className="border-b border-border bg-surface/40">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-text-primary">New paper bot</span>
        <button
          onClick={onClose}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-panel-light cursor-pointer"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-2 space-y-3">
        <Field label="Risk profile">
          <div className="grid grid-cols-3 gap-1.5">
            {RISK_PROFILE_ORDER.map(p => {
              const bundle = RISK_PROFILES[p]
              const Icon = bundle.icon
              const on = form.riskProfile === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyProfile(p)}
                  title={bundle.blurb}
                  className={cn(
                    'flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-md border text-left transition-colors cursor-pointer',
                    on
                      ? bundle.toneClass
                      : 'bg-panel text-text-muted border-border hover:text-text-primary',
                  )}
                >
                  <span className="text-[11px] font-semibold flex items-center gap-1">
                    <Icon className="w-3 h-3" />
                    {bundle.label}
                  </span>
                  <span className="text-[9px] opacity-80 leading-tight line-clamp-2">
                    {bundle.blurb.split('.')[0]}
                  </span>
                </button>
              )
            })}
          </div>
          {form.riskProfile === 'custom' && (
            <div className="mt-1 text-[10px] text-text-muted font-mono italic">
              Custom — defaults tuned by hand.
            </div>
          )}
        </Field>

        <Field label="Start from a template">
          <div className="flex flex-wrap gap-1.5">
            {BOT_TEMPLATES.map(tpl => {
              const on = activeTemplate === tpl.id
              const perf = tpl.performance
              const Icon = tpl.icon
              return (
                <button
                  key={tpl.id}
                  onClick={() => applyTemplate(tpl)}
                  title={tpl.description}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors cursor-pointer',
                    on
                      ? 'bg-accent-dim/50 text-accent border-accent/40'
                      : 'bg-panel text-text-muted border-border hover:text-text-primary',
                  )}
                >
                  <Icon className="w-3 h-3" />
                  <span className="font-medium">{tpl.name}</span>
                  {perf && (
                    <span className={cn(
                      'text-[9px] font-mono ml-0.5',
                      on ? 'opacity-80' : 'opacity-60',
                    )}>
                      ~{Math.round(perf.winRate * 100)}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {(() => {
            const tpl = BOT_TEMPLATES.find(t => t.id === activeTemplate)
            if (!tpl?.performance) return null
            const p = tpl.performance
            return (
              <div className="mt-2 rounded-md border border-border bg-panel/40 px-2.5 py-2 text-[10px] font-mono">
                <div className="text-text-muted uppercase tracking-wider mb-1 flex items-baseline justify-between">
                  <span>Typical performance</span>
                  <span className="opacity-70">est · n≈{p.sample}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <PerfStat
                    label="Win rate"
                    value={`${Math.round(p.winRate * 100)}%`}
                    tone={p.winRate >= 0.55 ? 'long' : p.winRate < 0.5 ? 'short' : 'neutral'}
                  />
                  <PerfStat
                    label="Avg/trade"
                    value={`${p.avgTradePct >= 0 ? '+' : ''}${p.avgTradePct.toFixed(2)}%`}
                    tone={p.avgTradePct > 0 ? 'long' : 'short'}
                  />
                  <PerfStat
                    label="Max DD"
                    value={`-${p.maxDrawdownPct.toFixed(0)}%`}
                    tone={p.maxDrawdownPct >= 10 ? 'short' : 'neutral'}
                  />
                </div>
                <div className="text-text-muted opacity-70 italic mt-1.5">
                  Illustrative range for this archetype. Your run will vary by market and timing.
                </div>
              </div>
            )
          })()}
        </Field>

        <Field label="Name">
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
          />
        </Field>

        <Field label="Sources (any if none selected)">
          <div className="flex flex-wrap gap-1.5">
            {SOURCE_OPTIONS.map(src => {
              const on = form.allowedSources.includes(src)
              return (
                <button
                  key={src}
                  onClick={() => toggleSource(src)}
                  className={cn(
                    'px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border transition-colors cursor-pointer',
                    on
                      ? 'bg-accent-dim/50 text-accent border-accent/40'
                      : 'bg-panel text-text-muted border-border hover:text-text-primary',
                  )}
                >
                  {src}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label={`Min confidence: ${form.minConfidence}%`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={form.minConfidence}
            onChange={e => setForm(f => ({ ...f, minConfidence: Number(e.target.value) }))}
            className="w-full accent-accent"
          />
        </Field>

        <Field label="Sizing mode">
          <div className="grid grid-cols-2 gap-1.5 mb-1.5">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, sizingMode: 'fixed_usd', riskProfile: 'custom' }))}
              className={cn(
                'px-2 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer',
                form.sizingMode === 'fixed_usd'
                  ? 'bg-accent-dim/40 text-accent border-accent/40'
                  : 'bg-panel text-text-muted border-border hover:text-text-primary',
              )}
            >
              Fixed USD
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, sizingMode: 'risk_pct', riskProfile: 'custom' }))}
              className={cn(
                'px-2 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer',
                form.sizingMode === 'risk_pct'
                  ? 'bg-accent-dim/40 text-accent border-accent/40'
                  : 'bg-panel text-text-muted border-border hover:text-text-primary',
              )}
            >
              Risk % of equity
            </button>
          </div>
          {form.sizingMode === 'risk_pct' ? (
            <RiskPctSizing
              riskPct={form.riskPctPerTrade}
              stopLossPct={form.stopLossPct}
              fallbackUsd={form.positionSizeUsd}
              equity={accountEquityUsd}
              onRiskPctChange={(v) => setForm(f => ({ ...f, riskPctPerTrade: v, riskProfile: 'custom' }))}
              onSetEquity={(v) => setRiskLimits({ accountEquityUsd: v })}
            />
          ) : (
            <input
              type="number"
              min={1}
              value={form.positionSizeUsd}
              onChange={e => setForm(f => ({ ...f, positionSizeUsd: Number(e.target.value), riskProfile: 'custom' }))}
              className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent font-mono"
              title="Notional USD per trade"
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Hold (min)">
            <input
              type="number"
              min={1}
              value={form.holdMinutes}
              onChange={e => setForm(f => ({ ...f, holdMinutes: Number(e.target.value) }))}
              className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent font-mono"
            />
          </Field>
          <Field label="Max/day">
            <input
              type="number"
              min={1}
              value={form.maxTradesPerDay}
              onChange={e => setForm(f => ({ ...f, maxTradesPerDay: Number(e.target.value) }))}
              className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent font-mono"
            />
          </Field>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
            Risk exits (0 = off)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Field label="Stop loss %">
              <input
                type="number"
                min={0}
                step="0.1"
                value={form.stopLossPct}
                onChange={e => setForm(f => ({ ...f, stopLossPct: Math.max(0, Number(e.target.value)) }))}
                title="Close when PnL falls to -X% from entry. Recommended: 1-3."
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-short outline-none focus:border-short font-mono"
              />
            </Field>
            <Field label="Take profit %">
              <input
                type="number"
                min={0}
                step="0.1"
                value={form.takeProfitPct}
                onChange={e => setForm(f => ({ ...f, takeProfitPct: Math.max(0, Number(e.target.value)) }))}
                title="Close when PnL hits +X% from entry. Recommended: 2-6."
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-long outline-none focus:border-long font-mono"
              />
            </Field>
            <Field label="Trailing %">
              <input
                type="number"
                min={0}
                step="0.1"
                value={form.trailingStopPct}
                onChange={e => setForm(f => ({ ...f, trailingStopPct: Math.max(0, Number(e.target.value)) }))}
                title="Locks gains: close when PnL drops X% from its peak. Only arms after a win."
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-accent outline-none focus:border-accent font-mono"
              />
            </Field>
            <Field label="BE at %">
              <input
                type="number"
                min={0}
                step="0.1"
                value={form.breakEvenAtPct}
                onChange={e => setForm(f => ({ ...f, breakEvenAtPct: Math.max(0, Number(e.target.value)) }))}
                title="Once PnL reaches +X%, move stop to entry. Risk-free trade from there. Independent of trailing."
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-amber-300 outline-none focus:border-amber-300 font-mono"
              />
            </Field>
          </div>
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
              Multi-target TPs (0 = single-TP mode)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="TP1 %">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.tp1Pct}
                  onChange={e => setForm(f => ({ ...f, tp1Pct: Math.max(0, Number(e.target.value)) }))}
                  title="First TP — partial close. Set to take some profit and let the rest ride."
                  className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-long outline-none focus:border-long font-mono"
                />
              </Field>
              <Field label="Close at TP1 %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="5"
                  value={form.tp1ClosePct}
                  onChange={e => setForm(f => ({ ...f, tp1ClosePct: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                  title="Percent of position to close at TP1 (e.g. 50 = half off)."
                  className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent font-mono"
                />
              </Field>
              <Field label="TP2 %">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.tp2Pct}
                  onChange={e => setForm(f => ({ ...f, tp2Pct: Math.max(0, Number(e.target.value)) }))}
                  title="Final TP for the runner. Falls back to single-TP value if 0."
                  className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-long outline-none focus:border-long font-mono"
                />
              </Field>
            </div>
            {form.tp1Pct > 0 && form.tp2Pct > 0 && form.tp2Pct <= form.tp1Pct && (
              <div className="text-[10px] text-short mt-1 font-mono">
                TP2 must be greater than TP1 — runner has no upside.
              </div>
            )}
          </div>
        </div>

        <Field label={`Markets (${form.allowedMarkets.length === 0 ? 'any' : form.allowedMarkets.length + ' selected'})`}>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {markets.slice(0, 30).map(m => {
              const on = form.allowedMarkets.includes(m.symbol)
              return (
                <button
                  key={m.symbol}
                  onClick={() => toggleMarket(m.symbol)}
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors cursor-pointer',
                    on
                      ? 'bg-accent-dim/50 text-accent border-accent/40'
                      : 'bg-panel text-text-muted border-border hover:text-text-primary',
                  )}
                >
                  {m.symbol}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="pt-1 space-y-2">
          <button
            type="button"
            onClick={runPreview}
            disabled={candles.length < 50}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md border border-accent/40 bg-accent-dim/20 text-accent hover:bg-accent-dim/40 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={candles.length < 50 ? 'Need at least 50 candles on the active market to preview' : `Replay this config against ${candles.length} candles of ${selectedMarket.symbol}`}
          >
            <Activity className="w-3 h-3" />
            Preview backtest{preview ? ' · re-run' : ''}
          </button>

          {preview && (
            <div className="rounded-md border border-border bg-panel/40 px-2.5 py-2 text-[10px] font-mono space-y-1">
              <div className="flex items-center justify-between text-text-muted uppercase tracking-wider">
                <span>{selectedMarket.symbol} · {preview.trades.length} trades · {preview.candleCount} bars</span>
                <span>
                  {preview.trades.length > 0
                    ? `${((preview.windowEnd - preview.windowStart) / 86400000).toFixed(0)}d window`
                    : 'no fills'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <PreviewStat
                  label="Net"
                  value={`${preview.totalPnlUsd >= 0 ? '+' : ''}$${formatUsd(preview.totalPnlUsd)}`}
                  tone={preview.totalPnlUsd > 0 ? 'long' : preview.totalPnlUsd < 0 ? 'short' : 'neutral'}
                />
                <PreviewStat
                  label="Win"
                  value={preview.trades.length > 0 ? `${(preview.winRate * 100).toFixed(0)}%` : '—'}
                  tone={preview.winRate >= 0.55 ? 'long' : preview.winRate < 0.45 && preview.trades.length >= 3 ? 'short' : 'neutral'}
                />
                <PreviewStat label="W/L" value={`${preview.wins}/${preview.losses}`} />
                <PreviewStat label="Max DD" value={`$${formatUsd(preview.maxDrawdownUsd)}`} tone={preview.maxDrawdownUsd > 0 ? 'short' : 'neutral'} />
              </div>
              {preview.trades.length > 0 && (
                <div className="flex items-center gap-1.5 text-text-muted">
                  {preview.totalPnlUsd >= 0
                    ? <TrendingUp className="w-3 h-3 text-long" />
                    : <TrendingDown className="w-3 h-3 text-short" />}
                  <span>Historical only · live results will differ.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            className="flex-1 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Create bot
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md bg-surface text-text-muted border border-border hover:text-text-primary transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function RiskPctSizing({
  riskPct, stopLossPct, fallbackUsd, equity, onRiskPctChange, onSetEquity,
}: {
  riskPct: number
  stopLossPct: number
  fallbackUsd: number
  equity: number
  onRiskPctChange: (v: number) => void
  onSetEquity: (v: number) => void
}) {
  const computedNotional = equity > 0 && riskPct > 0 && stopLossPct > 0
    ? Math.min(equity, (equity * riskPct / 100) / (stopLossPct / 100))
    : null
  const dollarsAtRisk = equity > 0 && riskPct > 0 ? equity * riskPct / 100 : null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          step="0.05"
          value={riskPct}
          onChange={e => onRiskPctChange(Math.max(0, Number(e.target.value)))}
          className="flex-1 bg-panel border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent font-mono"
          title="Percent of total equity to risk per trade. Typical pro range: 0.25–1.0%."
        />
        <span className="text-[10px] font-mono text-text-muted">% of equity</span>
      </div>
      {equity > 0 ? (
        <div className="rounded-md border border-border bg-panel/40 px-2 py-1.5 text-[10px] font-mono space-y-0.5">
          <div className="flex justify-between text-text-muted">
            <span>Equity</span>
            <span className="text-text-secondary">${equity.toLocaleString()}</span>
          </div>
          {dollarsAtRisk !== null && (
            <div className="flex justify-between text-text-muted">
              <span>$ at risk / trade</span>
              <span className={dollarsAtRisk > equity * 0.02 ? 'text-amber-300' : 'text-text-primary'}>
                ${dollarsAtRisk.toFixed(2)}
              </span>
            </div>
          )}
          {computedNotional !== null ? (
            <div className="flex justify-between">
              <span className="text-text-muted">Notional / trade</span>
              <span className="text-accent font-semibold">${computedNotional.toFixed(2)}</span>
            </div>
          ) : (
            <div className="text-text-muted italic">
              Set a stop-loss % below to compute notional.
            </div>
          )}
        </div>
      ) : (
        <EquityPrompt fallbackUsd={fallbackUsd} onSetEquity={onSetEquity} />
      )}
    </div>
  )
}

function EquityPrompt({ fallbackUsd, onSetEquity }: { fallbackUsd: number; onSetEquity: (v: number) => void }) {
  const [val, setVal] = useState('')
  return (
    <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-relaxed">
      <div className="text-amber-200 font-semibold mb-1">Set your equity first</div>
      <div className="text-text-muted mb-1.5">
        Risk-percent sizing needs to know your total tradeable equity.
        Falling back to fixed ${fallbackUsd}/trade until set.
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          step="100"
          value={val}
          placeholder="e.g. 10000"
          onChange={e => setVal(e.target.value)}
          className="flex-1 bg-surface border border-border rounded px-2 py-1 text-[11px] font-mono outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => {
            const n = Number(val)
            if (n > 0) onSetEquity(n)
          }}
          className="px-2 py-1 rounded bg-accent text-white text-[10px] font-semibold uppercase tracking-wider cursor-pointer"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function PerfStat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'long' | 'short' | 'neutral' }) {
  const toneCls = tone === 'long' ? 'text-long' : tone === 'short' ? 'text-short' : 'text-text-primary'
  return (
    <div className="flex flex-col items-start">
      <span className="text-[9px] text-text-muted uppercase tracking-wider">{label}</span>
      <span className={cn('font-semibold tabular-nums text-[11px]', toneCls)}>{value}</span>
    </div>
  )
}

function PreviewStat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'long' | 'short' | 'neutral' }) {
  const toneCls = tone === 'long' ? 'text-long' : tone === 'short' ? 'text-short' : 'text-text-primary'
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-text-muted uppercase tracking-wider">{label}</span>
      <span className={cn('font-semibold tabular-nums', toneCls)}>{value}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
