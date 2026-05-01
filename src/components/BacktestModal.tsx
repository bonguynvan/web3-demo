/**
 * BacktestModal — replay a bot config against historical candles.
 *
 * User picks a market and a lookback window, hits Run. We fetch
 * klines from the active adapter and pass them to the pure
 * runBacktest function. Results render with a totals strip,
 * equity-curve sparkline, and a recent-trades list.
 */

import { useState } from 'react'
import { X, Play, ArrowDown, ArrowUp } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useTradingStore } from '../store/tradingStore'
import { getActiveAdapter } from '../adapters/registry'
import { runBacktest, type BacktestResult } from '../bots/backtest'
import { cn, formatUsd } from '../lib/format'
import type { BotConfig } from '../bots/types'
import type { TimeFrame } from '../adapters/types'

interface Props {
  open: boolean
  onClose: () => void
  bot: BotConfig
}

const TIMEFRAMES: { label: string; value: TimeFrame; barsPerDay: number }[] = [
  { label: '5m',  value: '5m',  barsPerDay: 288 },
  { label: '15m', value: '15m', barsPerDay: 96 },
  { label: '1h',  value: '1h',  barsPerDay: 24 },
  { label: '4h',  value: '4h',  barsPerDay: 6 },
]

const LOOKBACKS: { label: string; days: number }[] = [
  { label: '1d',  days: 1 },
  { label: '3d',  days: 3 },
  { label: '7d',  days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
]

type RunState =
  | { kind: 'idle' }
  | { kind: 'fetching' }
  | { kind: 'running' }
  | { kind: 'done'; result: BacktestResult; marketId: string; timeframe: TimeFrame }
  | { kind: 'error'; message: string }

export function BacktestModal({ open, onClose, bot }: Props) {
  const markets = useTradingStore(s => s.markets)
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const [marketId, setMarketId] = useState(selectedMarket.symbol)
  const [timeframe, setTimeframe] = useState<TimeFrame>('15m')
  const [days, setDays] = useState(7)
  const [state, setState] = useState<RunState>({ kind: 'idle' })

  const handleRun = async () => {
    setState({ kind: 'fetching' })
    try {
      const adapter = getActiveAdapter()
      const tfMeta = TIMEFRAMES.find(t => t.value === timeframe)!
      const barsNeeded = Math.min(tfMeta.barsPerDay * days, 1500)
      const candles = await adapter.getKlines(marketId, timeframe, { limit: barsNeeded })
      setState({ kind: 'running' })
      // Yield to the browser before the synchronous compute so the
      // "running" state actually renders.
      await new Promise(r => setTimeout(r, 0))
      const result = runBacktest(bot, marketId, candles)
      setState({ kind: 'done', result, marketId, timeframe })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'fetch failed',
      })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Backtest — ${bot.name}`}>
      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="bg-surface/60 rounded-md p-3 text-[11px] text-text-muted leading-relaxed">
          <span className="text-text-primary font-medium">{bot.name}</span>
          {' · '}min conf {Math.round(bot.minConfidence * 100)}%
          {' · '}${bot.positionSizeUsd}/trade · {bot.holdMinutes}m hold
          {bot.allowedSources.length > 0 && (
            <> · {bot.allowedSources.join(' / ')}</>
          )}
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
            disabled={state.kind === 'fetching' || state.kind === 'running'}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5" />
            {state.kind === 'fetching' ? 'Fetching candles…'
              : state.kind === 'running' ? 'Running…'
              : 'Run backtest'}
          </button>
          {state.kind === 'error' && (
            <span className="text-xs text-short">{state.message}</span>
          )}
        </div>

        {state.kind === 'done' && (
          <BacktestResults
            result={state.result}
            marketId={state.marketId}
            timeframe={state.timeframe}
          />
        )}
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

function BacktestResults({
  result, marketId, timeframe,
}: {
  result: BacktestResult
  marketId: string
  timeframe: TimeFrame
}) {
  const pnlColor = result.totalPnlUsd >= 0 ? 'text-long' : 'text-short'

  if (result.trades.length === 0) {
    return (
      <div className="bg-surface/60 rounded-md p-6 text-center">
        <div className="text-sm text-text-secondary mb-1">No trades</div>
        <div className="text-[11px] text-text-muted">
          Bot config did not match any signals across {result.candleCount}{' '}
          {timeframe} candles. Try a wider lookback, lower min-confidence, or a
          different market.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface/30 border border-border rounded-md p-4">
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">Backtest P&L</div>
            <div className={cn('text-2xl font-mono font-bold tabular-nums', pnlColor)}>
              {result.totalPnlUsd >= 0 ? '+' : ''}${formatUsd(result.totalPnlUsd)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">Win rate</div>
            <div className="text-lg font-mono text-text-primary tabular-nums">
              {Math.round(result.winRate * 100)}%
            </div>
          </div>
        </div>
        <EquityCurveSpark points={result.equityCurve} className="mb-3" />
        <div className="grid grid-cols-4 gap-2">
          <SmallStat label="Trades" value={`${result.trades.length}`} />
          <SmallStat label="Wins" value={`${result.wins}`} />
          <SmallStat label="Losses" value={`${result.losses}`} />
          <SmallStat
            label="Max DD"
            value={`-$${formatUsd(result.maxDrawdownUsd)}`}
            valueClass="text-short"
          />
        </div>
        <div className="text-[10px] text-text-muted mt-3">
          {marketId} · {timeframe} · {result.candleCount} bars
        </div>
      </div>

      <details className="bg-surface/30 border border-border rounded-md overflow-hidden">
        <summary className="px-4 py-2 text-xs text-text-secondary cursor-pointer hover:bg-panel-light">
          Trade ledger ({result.trades.length})
        </summary>
        <div className="max-h-64 overflow-y-auto">
          {result.trades.slice().reverse().map(t => {
            const tradePnlColor = t.pnlUsd >= 0 ? 'text-long' : 'text-short'
            const isLong = t.direction === 'long'
            const Arrow = isLong ? ArrowUp : ArrowDown
            return (
              <div key={t.id} className="flex items-center gap-2 px-4 py-1.5 text-[11px] border-t border-border/40">
                <Arrow className={cn('w-3 h-3', isLong ? 'text-long' : 'text-short')} />
                <span className="font-mono text-text-secondary w-20">${formatUsd(t.entryPrice)}</span>
                <span className="text-text-muted">→</span>
                <span className="font-mono text-text-secondary w-20">${formatUsd(t.closePrice)}</span>
                <span className={cn('font-mono w-20 text-right', tradePnlColor)}>
                  {t.pnlUsd >= 0 ? '+' : ''}${formatUsd(t.pnlUsd)}
                </span>
                <span className="text-text-muted text-[10px] flex-1 text-right">
                  {t.signalSource} · {t.closeReason === 'opposing-confluence' ? 'reversed' : 'expired'}
                </span>
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

function EquityCurveSpark({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null
  const W = 100
  const H = 36
  const xMax = points.length
  const ys = [0, ...points]
  const yMin = Math.min(0, ...points)
  const yMax = Math.max(0, ...points)
  const yPad = (yMax - yMin) * 0.1 || 1

  const project = (x: number, y: number) => ({
    px: (x / xMax) * W,
    py: H - ((y - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad))) * H,
  })

  const polyPoints = ys.map((y, i) => {
    const { px, py } = project(i, y)
    return `${px.toFixed(2)},${py.toFixed(2)}`
  }).join(' ')

  const final = points[points.length - 1]
  const positive = final >= 0
  const stroke = positive ? '#22c55e' : '#ef4444'
  const fill = positive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'
  const last = project(xMax, final)
  const first = project(0, 0)
  const areaPath = `M ${first.px},${H} L ${polyPoints.replace(/,/g, ' ').replace(/  /g, ' ')} L ${last.px},${H} Z`
  const zero = project(0, 0).py

  return (
    <svg className={className} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1={0} y1={zero} x2={W} y2={zero} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="2 2" />
      <path d={areaPath} fill={fill} />
      <polyline
        points={polyPoints}
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
      <div className={cn('text-[11px] font-mono mt-0.5 tabular-nums', valueClass ?? 'text-text-primary')}>
        {value}
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
