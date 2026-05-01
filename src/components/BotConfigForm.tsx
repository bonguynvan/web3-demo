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
import { useTradingStore } from '../store/tradingStore'
import { BOT_TEMPLATES, type BotTemplate } from '../bots/templates'
import { cn } from '../lib/format'
import type { SignalSource } from '../signals/types'

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
}

const DEFAULT_FORM: FormState = {
  name: 'New Bot',
  allowedSources: ['confluence'],
  allowedMarkets: [],
  minConfidence: 70,
  positionSizeUsd: 100,
  holdMinutes: 60,
  maxTradesPerDay: 10,
}

export function BotConfigForm({ onClose }: { onClose: () => void }) {
  const addBot = useBotStore(s => s.addBot)
  const markets = useTradingStore(s => s.markets)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)

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
        <Field label="Start from a template">
          <div className="flex flex-wrap gap-1.5">
            {BOT_TEMPLATES.map(tpl => {
              const on = activeTemplate === tpl.id
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
                  <span>{tpl.emoji}</span>
                  <span className="font-medium">{tpl.name}</span>
                </button>
              )
            })}
          </div>
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

        <div className="grid grid-cols-3 gap-2">
          <Field label="Size (USD)">
            <input
              type="number"
              min={1}
              value={form.positionSizeUsd}
              onChange={e => setForm(f => ({ ...f, positionSizeUsd: Number(e.target.value) }))}
              className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent font-mono"
            />
          </Field>
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
