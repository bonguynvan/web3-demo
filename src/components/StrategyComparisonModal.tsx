/**
 * StrategyComparisonModal — side-by-side backtest of 2-4 strategies.
 *
 * User picks templates and/or saved bots, a market, timeframe, and
 * lookback. We fetch historical candles once and run runBacktest per
 * strategy. Results render as overlaid equity curves on a shared time
 * axis plus a stats table.
 */

import { useState } from 'react'
import { X, Play, BarChart3, Bot, type LucideIcon } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useTradingStore } from '../store/tradingStore'
import { useBotStore } from '../store/botStore'
import { getActiveAdapter } from '../adapters/registry'
import { runBacktest, type BacktestResult } from '../bots/backtest'
import { BOT_TEMPLATES, type BotTemplate } from '../bots/templates'
import { cn, formatUsd } from '../lib/format'
import type { BotConfig } from '../bots/types'
import type { TimeFrame } from '../adapters/types'

interface Props {
  open: boolean
  onClose: () => void
}

const MAX_STRATEGIES = 4
const STRATEGY_COLORS = ['#22c55e', '#a875ff', '#f59e0b', '#06b6d4']

const TIMEFRAMES: { label: string; value: TimeFrame; barsPerDay: number }[] = [
  { label: '5m',  value: '5m',  barsPerDay: 288 },
  { label: '15m', value: '15m', barsPerDay: 96 },
  { label: '1h',  value: '1h',  barsPerDay: 24 },
  { label: '4h',  value: '4h',  barsPerDay: 6 },
]

const LOOKBACKS: { label: string; days: number }[] = [
  { label: '7d',  days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
]

interface Strategy {
  key: string
  name: string
  icon: LucideIcon
  config: BotConfig
}

interface StrategyResult {
  strategy: Strategy
  result: BacktestResult
  color: string
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'fetching' }
  | { kind: 'running' }
  | { kind: 'done'; results: StrategyResult[]; marketId: string; timeframe: TimeFrame }
  | { kind: 'error'; message: string }

export function StrategyComparisonModal({ open, onClose }: Props) {
  const markets = useTradingStore(s => s.markets)
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const savedBots = useBotStore(s => s.bots)

  const [marketId, setMarketId] = useState(selectedMarket.symbol)
  const [timeframe, setTimeframe] = useState<TimeFrame>('15m')
  const [days, setDays] = useState(7)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [state, setState] = useState<RunState>({ kind: 'idle' })

  const allStrategies: Strategy[] = [
    ...BOT_TEMPLATES.map(t => templateToStrategy(t)),
    ...savedBots.map(b => savedBotToStrategy(b)),
  ]

  const toggleStrategy = (key: string) => {
    setSelectedKeys(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key)
      if (prev.length >= MAX_STRATEGIES) return prev
      return [...prev, key]
    })
  }

  const handleRun = async () => {
    if (selectedKeys.length < 2) return
    setState({ kind: 'fetching' })
    try {
      const adapter = getActiveAdapter()
      const tfMeta = TIMEFRAMES.find(t => t.value === timeframe)!
      const barsNeeded = Math.min(tfMeta.barsPerDay * days, 1500)
      const candles = await adapter.getKlines(marketId, timeframe, { limit: barsNeeded })
      setState({ kind: 'running' })
      await new Promise(r => setTimeout(r, 0))

      const picked = selectedKeys
        .map(k => allStrategies.find(s => s.key === k))
        .filter((s): s is Strategy => Boolean(s))

      const results: StrategyResult[] = picked.map((strategy, i) => ({
        strategy,
        result: runBacktest(strategy.config, marketId, candles),
        color: STRATEGY_COLORS[i % STRATEGY_COLORS.length],
      }))
      setState({ kind: 'done', results, marketId, timeframe })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'fetch failed',
      })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Strategy comparison">
      <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
        <div className="text-[11px] text-text-muted">
          Pick 2–{MAX_STRATEGIES} strategies. Each runs against the same candles —
          fair side-by-side comparison.
        </div>

        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
            Strategies ({selectedKeys.length}/{MAX_STRATEGIES})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allStrategies.map(s => {
              const idx = selectedKeys.indexOf(s.key)
              const on = idx >= 0
              const color = on ? STRATEGY_COLORS[idx] : undefined
              return (
                <button
                  key={s.key}
                  onClick={() => toggleStrategy(s.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 text-[11px] rounded border transition-colors cursor-pointer',
                    on
                      ? 'bg-panel text-text-primary border-accent/40'
                      : 'bg-panel text-text-muted border-border hover:text-text-primary',
                  )}
                >
                  {on && color && (
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  )}
                  <s.icon className="w-3 h-3" />
                  <span className="font-medium">{s.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Market">
            <select
              value={marketId}
              onChange={e => setMarketId(e.target.value)}
              className="w-full bg-panel border border-border rounded px-2 py-2 text-xs text-text-primary outline-none focus:border-accent font-mono"
            >
              {markets.map(m => (
                <option key={m.symbol} value={m.symbol}>{m.symbol}</option>
              ))}
            </select>
          </Field>
          <Field label="Timeframe">
            <div className="flex gap-1">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.value}
                  onClick={() => setTimeframe(tf.value)}
                  className={cn(
                    'flex-1 py-2 text-[11px] font-medium rounded transition-colors cursor-pointer',
                    timeframe === tf.value
                      ? 'bg-accent text-white'
                      : 'bg-surface text-text-muted hover:text-text-primary',
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Lookback">
            <div className="flex gap-1">
              {LOOKBACKS.map(lb => (
                <button
                  key={lb.days}
                  onClick={() => setDays(lb.days)}
                  className={cn(
                    'flex-1 py-2 text-[11px] font-medium rounded transition-colors cursor-pointer',
                    days === lb.days
                      ? 'bg-accent text-white'
                      : 'bg-surface text-text-muted hover:text-text-primary',
                  )}
                >
                  {lb.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={selectedKeys.length < 2 || state.kind === 'fetching' || state.kind === 'running'}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5" />
            {state.kind === 'fetching' ? 'Fetching candles…'
              : state.kind === 'running' ? 'Running…'
              : 'Compare'}
          </button>
          {selectedKeys.length < 2 && (
            <span className="text-[11px] text-text-muted">Pick at least 2 strategies.</span>
          )}
          {state.kind === 'error' && (
            <span className="text-xs text-short">{state.message}</span>
          )}
        </div>

        {state.kind === 'done' && <ComparisonResults results={state.results} />}
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

function ComparisonResults({ results }: { results: StrategyResult[] }) {
  if (results.length === 0) return null
  return (
    <div className="space-y-3">
      <OverlayChart results={results} />
      <ComparisonTable results={results} />
    </div>
  )
}

function OverlayChart({ results }: { results: StrategyResult[] }) {
  const W = 100
  const H = 80

  // Build time-indexed cumulative-PnL series for each strategy.
  // X is normalized 0..1 across the global window so all curves
  // share the same axis.
  const series = results.map(r => {
    const start = r.result.windowStart
    const end = Math.max(r.result.windowEnd, start + 1)
    const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }]
    let cum = 0
    for (const t of r.result.trades) {
      cum += t.pnlUsd
      pts.push({ x: (t.closedAtTime - start) / (end - start), y: cum })
    }
    return { result: r, pts }
  })

  const allYs = series.flatMap(s => s.pts.map(p => p.y))
  const yMin = Math.min(0, ...allYs)
  const yMax = Math.max(0, ...allYs)
  const yPad = (yMax - yMin) * 0.1 || 1
  const project = (x: number, y: number) => ({
    px: x * W,
    py: H - ((y - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad))) * H,
  })
  const zero = project(0, 0).py

  return (
    <div className="bg-surface/30 border border-border rounded-md p-4">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-medium text-text-primary">Equity curves</span>
        <span className="text-[10px] text-text-muted ml-auto">
          shared time axis · cumulative realized P&L
        </span>
      </div>
      <svg width="100%" height={H * 2} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line x1={0} y1={zero} x2={W} y2={zero} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="2 2" />
        {series.map(({ result, pts }) => {
          const polyPoints = pts.map(p => {
            const { px, py } = project(p.x, p.y)
            return `${px.toFixed(2)},${py.toFixed(2)}`
          }).join(' ')
          return (
            <polyline
              key={result.strategy.key}
              points={polyPoints}
              fill="none"
              stroke={result.color}
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>
    </div>
  )
}

function ComparisonTable({ results }: { results: StrategyResult[] }) {
  return (
    <div className="bg-surface/30 border border-border rounded-md overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
            <th className="text-left px-3 py-2 font-medium">Strategy</th>
            <th className="text-right px-3 py-2 font-medium">Trades</th>
            <th className="text-right px-3 py-2 font-medium">Win %</th>
            <th className="text-right px-3 py-2 font-medium">P&L</th>
            <th className="text-right px-3 py-2 font-medium">Max DD</th>
          </tr>
        </thead>
        <tbody>
          {results.map(r => {
            const pnlColor = r.result.totalPnlUsd >= 0 ? 'text-long' : 'text-short'
            return (
              <tr key={r.strategy.key} className="border-b border-border/40 last:border-b-0">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                    <r.strategy.icon className="w-3 h-3 text-text-muted shrink-0" />
                    <span className="text-text-primary font-medium truncate">{r.strategy.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-text-secondary">{r.result.trades.length}</td>
                <td className="px-3 py-2 text-right font-mono text-text-secondary">
                  {r.result.trades.length > 0 ? `${Math.round(r.result.winRate * 100)}%` : '—'}
                </td>
                <td className={cn('px-3 py-2 text-right font-mono font-medium', pnlColor)}>
                  {r.result.totalPnlUsd >= 0 ? '+' : ''}${formatUsd(r.result.totalPnlUsd)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-short">
                  -${formatUsd(r.result.maxDrawdownUsd)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function templateToStrategy(t: BotTemplate): Strategy {
  return {
    key: `tpl:${t.id}`,
    name: t.name,
    icon: t.icon,
    config: {
      id: `bt-tpl-${t.id}`,
      name: t.name,
      enabled: true,
      mode: 'paper',
      allowedSources: t.config.allowedSources,
      allowedMarkets: [],
      minConfidence: t.config.minConfidence,
      positionSizeUsd: t.config.positionSizeUsd,
      holdMinutes: t.config.holdMinutes,
      maxTradesPerDay: t.config.maxTradesPerDay,
      createdAt: 0,
    },
  }
}

function savedBotToStrategy(b: BotConfig): Strategy {
  return {
    key: `bot:${b.id}`,
    name: b.name,
    icon: Bot,
    config: b,
  }
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
