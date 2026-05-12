/**
 * BacktestReplayPage — visualize a bot's backtest playing back bar-by-bar.
 *
 * Self-contained chart instance, no AppShell. Runs runBacktest() to get
 * the trade list, loads the full candle series into a fresh @tradecanvas
 * chart, then drives chart.replay() so each bar paints in sequence.
 * A polled HUD on the right tracks the active virtual position and the
 * realized PnL, growing in lockstep with the playhead.
 *
 * Inputs come via location.state from BacktestModal — bot, marketId,
 * timeframe, days. Direct visits with no state redirect to /bots.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Chart, type OHLCBar } from '@tradecanvas/chart'
import {
  Play, Pause, Square, ArrowLeft, ChevronsLeft,
} from 'lucide-react'
import { Wordmark } from '../components/ui/Logo'
import { getActiveAdapter } from '../adapters/registry'
import { runBacktest, type BacktestResult, type BacktestTrade } from '../bots/backtest'
import { useThemeStore } from '../store/themeStore'
import { getChartTheme } from '../lib/chartConfig'
import { useDocumentMeta } from '../lib/documentMeta'
import type { BotConfig } from '../bots/types'
import type { TimeFrame } from '../adapters/types'
import type { CandleData } from '../types/trading'
import { cn, formatUsd } from '../lib/format'

const TIMEFRAMES: { value: TimeFrame; barsPerDay: number }[] = [
  { value: '5m', barsPerDay: 288 },
  { value: '15m', barsPerDay: 96 },
  { value: '1h', barsPerDay: 24 },
  { value: '4h', barsPerDay: 6 },
]

const SPEEDS = [1, 2, 5, 10, 20, 50] as const

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; candles: CandleData[]; result: BacktestResult }

interface ReplayState {
  candleIdx: number
  status: 'playing' | 'paused' | 'stopped'
}

interface NavState {
  bot: BotConfig
  marketId: string
  timeframe: TimeFrame
  days: number
  result?: BacktestResult
  candles?: CandleData[]
}

export function BacktestReplayPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const navState = location.state as NavState | null
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const rafRef = useRef<number | null>(null)
  const appTheme = useThemeStore(s => s.theme)

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })

  useDocumentMeta({
    title: navState?.bot
      ? `Backtest replay — ${navState.bot.name} · TradingDek`
      : 'Backtest replay · TradingDek',
    description:
      `Watch a paper-trading bot's decisions play back bar-by-bar against historical candles. Entry arrows, exit arrows, and a running PnL HUD let you audit the strategy before enabling live mode.`,
    canonical: '/replay',
    ogImage: '/og.png',
    ogType: 'article',
  })
  const [replay, setReplay] = useState<ReplayState>({ candleIdx: 0, status: 'stopped' })
  const [speed, setSpeed] = useState<number>(5)

  useEffect(() => {
    if (!navState?.bot) navigate('/bots', { replace: true })
  }, [navState, navigate])

  // Fetch candles + compute backtest
  useEffect(() => {
    if (!navState?.bot) return
    let cancelled = false

    void (async () => {
      try {
        let candles: CandleData[]
        if (navState.candles && navState.candles.length > 0) {
          candles = navState.candles
        } else {
          const adapter = getActiveAdapter()
          const tfMeta = TIMEFRAMES.find(t => t.value === navState.timeframe)
                       ?? { value: '15m' as TimeFrame, barsPerDay: 96 }
          const barsNeeded = Math.min(tfMeta.barsPerDay * navState.days, 1500)
          candles = await adapter.getKlines(navState.marketId, navState.timeframe, { limit: barsNeeded })
        }
        if (cancelled) return

        const result = navState.result
                     ?? runBacktest(navState.bot, navState.marketId, candles)
        if (cancelled) return

        setLoad({ kind: 'ready', candles, result })
      } catch (err) {
        if (cancelled) return
        setLoad({
          kind: 'error',
          message: err instanceof Error ? err.message : 'fetch failed',
        })
      }
    })()

    return () => { cancelled = true }
  }, [navState])

  // Mount chart and seed the full historical series
  useEffect(() => {
    if (load.kind !== 'ready') return
    const el = containerRef.current
    if (!el) return

    let chart: Chart | null = null
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width === 0 || height === 0) return
      if (chart) return

      chart = new Chart(el, {
        chartType: 'candlestick',
        theme: getChartTheme(appTheme),
        autoScale: true,
        rightMargin: 5,
        crosshair: { mode: 'magnet' },
        features: {
          drawings: true,
          drawingMagnet: false,
          drawingUndoRedo: false,
          trading: false,
          indicators: true,
          panning: true,
          zooming: true,
          crosshair: true,
          keyboard: true,
          legend: true,
          volume: true,
          watermark: false,
          screenshot: false,
          alerts: false,
          barCountdown: false,
          logScale: false,
          replay: true,
        },
      })
      chartRef.current = chart

      const bars: OHLCBar[] = load.candles.map(c => ({
        time: c.time, open: c.open, high: c.high,
        low: c.low, close: c.close, volume: c.volume,
      }))
      chart.setData(bars)
    })
    observer.observe(el)

    return () => {
      observer.disconnect()
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      if (chart) chart.destroy()
      chartRef.current = null
    }
  }, [load, appTheme])

  // Poll replay status and progress on each animation frame. The chart's
  // replay manager doesn't expose events on the public surface, so we
  // sample state cheaply here and let React batch the renders.
  useEffect(() => {
    if (load.kind !== 'ready') return

    const tick = () => {
      const chart = chartRef.current
      if (chart) {
        const status = chart.getReplayState()
        const progress = chart.getReplayProgress()
        setReplay({ candleIdx: progress.current, status })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [load])

  // Re-stamp trade markers as drawings whenever the playhead advances —
  // entry arrow when openedAtIdx <= cur, exit arrow when closedAtIdx <= cur.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || load.kind !== 'ready') return

    // Match @tradecanvas/chart's DrawingState shape: type+anchors+style.
    // Arrows need two anchors (tail → head); we offset the tail 1.5% in
    // price so the arrow is visibly larger than a single bar.
    const drawings: unknown[] = []
    const cur = replay.candleIdx
    for (const t of load.result.trades) {
      if (t.openedAtIdx > cur) continue
      const entryBar = load.candles[t.openedAtIdx]
      if (!entryBar) continue
      const isLong = t.direction === 'long'
      const entryColor = isLong ? '#26d984' : '#ff5d6d'
      const entryOffset = t.entryPrice * 0.015
      drawings.push({
        id: `entry-${t.id}`,
        type: 'arrow',
        anchors: [
          { time: entryBar.time, price: isLong ? t.entryPrice - entryOffset : t.entryPrice + entryOffset },
          { time: entryBar.time, price: t.entryPrice },
        ],
        style: { color: entryColor, lineWidth: 2, lineStyle: 'solid' },
        visible: true,
        locked: true,
      })

      if (t.closedAtIdx <= cur) {
        const closeBar = load.candles[t.closedAtIdx]
        if (closeBar) {
          const winColor = t.pnlUsd >= 0 ? '#26d984' : '#ff5d6d'
          const closeOffset = t.closePrice * 0.015
          drawings.push({
            id: `exit-${t.id}`,
            type: 'arrow',
            anchors: [
              { time: closeBar.time, price: t.closePrice },
              { time: closeBar.time, price: isLong ? t.closePrice - closeOffset : t.closePrice + closeOffset },
            ],
            style: { color: winColor, lineWidth: 2, lineStyle: 'dashed' },
            visible: true,
            locked: true,
          })
        }
      }
    }

    try { chart.setDrawings(drawings as Parameters<typeof chart.setDrawings>[0]) } catch { /* drawings disabled */ }
  }, [replay.candleIdx, load])

  const summary = useMemo(() => {
    if (load.kind !== 'ready') return null
    return computeRunningSummary(load.result.trades, replay.candleIdx)
  }, [load, replay.candleIdx])

  const startReplay = () => chartRef.current?.replay({ speed })
  const pauseReplay = () => chartRef.current?.replayPause()
  const resumeReplay = () => chartRef.current?.replayResume()
  const stopReplay = () => chartRef.current?.replayStop()
  const seekToStart = () => chartRef.current?.replaySeek(0)
  const handleSpeed = (s: number) => {
    setSpeed(s)
    chartRef.current?.setReplaySpeed(s)
  }

  if (!navState?.bot) return null

  return (
    <div className="flex flex-col h-screen bg-surface text-text-primary">
      <header className="border-b border-border bg-panel/60 px-4 py-2 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <Wordmark size="sm" />
          </Link>
          <span className="text-text-muted text-xs">·</span>
          <span className="text-xs font-mono uppercase tracking-[0.16em] text-text-secondary">
            Backtest replay
          </span>
        </div>
        <Link
          to="/bots"
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to bots
        </Link>
      </header>

      <div className="border-b border-border bg-panel/40 px-4 py-2 flex items-center justify-between gap-4 flex-wrap shrink-0 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-mono text-text-primary">{navState.bot.name}</span>
          <span className="text-text-muted">·</span>
          <span className="font-mono text-text-secondary">{navState.marketId}</span>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted">{navState.timeframe} · {navState.days}d</span>
          {load.kind === 'ready' && (
            <>
              <span className="text-text-muted">·</span>
              <span className="text-text-muted">{load.result.trades.length} trades</span>
            </>
          )}
        </div>
        {load.kind === 'ready' && (
          <ReplayControls
            status={replay.status}
            speed={speed}
            progress={load.candles.length > 0 ? replay.candleIdx / Math.max(1, load.candles.length - 1) : 0}
            onPlay={startReplay}
            onPause={pauseReplay}
            onResume={resumeReplay}
            onStop={stopReplay}
            onRewind={seekToStart}
            onSpeed={handleSpeed}
          />
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 relative">
          <div ref={containerRef} className="absolute inset-0" />
          {load.kind === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
              Loading candles…
            </div>
          )}
          {load.kind === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center text-short text-sm">
              {load.message}
            </div>
          )}
        </div>

        {load.kind === 'ready' && summary && (
          <aside className="w-[280px] shrink-0 border-l border-border bg-panel/40 flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-border">
              <SummaryStat label="At bar" value={`${replay.candleIdx + 1} / ${load.candles.length}`} mono />
              <SummaryStat
                label="Realized PnL"
                value={`${summary.realizedPnl >= 0 ? '+' : ''}$${formatUsd(summary.realizedPnl)}`}
                tone={summary.realizedPnl >= 0 ? 'long' : 'short'}
                mono
              />
              <SummaryStat
                label="Closed trades"
                value={`${summary.closed.length} (W ${summary.wins} / L ${summary.losses})`}
                mono
              />
              {summary.openTrade && (
                <div className="mt-2 px-2 py-2 rounded border border-amber-400/30 bg-amber-400/5 text-[10px] leading-relaxed">
                  <div className="text-amber-400 uppercase tracking-[0.16em] font-mono mb-0.5">Open position</div>
                  <div className="font-mono text-text-primary">
                    {summary.openTrade.direction.toUpperCase()} @ ${formatUsd(summary.openTrade.entryPrice)}
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-text-muted font-mono">
                Trades
              </div>
              {load.result.trades.map((t, i) => {
                const opened = t.openedAtIdx <= replay.candleIdx
                const closed = t.closedAtIdx <= replay.candleIdx
                if (!opened) return null
                return (
                  <div
                    key={t.id}
                    className={cn(
                      'px-3 py-1.5 border-b border-border text-[11px]',
                      !closed && 'bg-amber-400/5',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-text-muted">#{i + 1}</span>
                      <span className={cn(
                        'text-[10px] uppercase tracking-wider font-semibold',
                        t.direction === 'long' ? 'text-long' : 'text-short',
                      )}>
                        {t.direction}
                      </span>
                      {closed ? (
                        <span className={cn(
                          'font-mono tabular-nums',
                          t.pnlUsd >= 0 ? 'text-long' : 'text-short',
                        )}>
                          {t.pnlUsd >= 0 ? '+' : ''}${formatUsd(t.pnlUsd)}
                        </span>
                      ) : (
                        <span className="text-amber-400 font-mono text-[10px]">open</span>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {t.signalSource} · entry ${formatUsd(t.entryPrice)}
                      {closed && <> → ${formatUsd(t.closePrice)}</>}
                    </div>
                  </div>
                )
              })}
              {load.result.trades.filter(t => t.openedAtIdx <= replay.candleIdx).length === 0 && (
                <div className="px-3 py-6 text-center text-[11px] text-text-muted">
                  No trades yet — keep playing.
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function ReplayControls({
  status, speed, progress,
  onPlay, onPause, onResume, onStop, onRewind, onSpeed,
}: {
  status: 'playing' | 'paused' | 'stopped'
  speed: number
  progress: number
  onPlay: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onRewind: () => void
  onSpeed: (s: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 h-1 rounded-full bg-border overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-150"
          style={{ width: `${Math.min(100, progress * 100).toFixed(1)}%` }}
        />
      </div>

      <div className="flex items-center gap-1">
        <ControlButton title="Rewind" onClick={onRewind}>
          <ChevronsLeft className="w-3.5 h-3.5" />
        </ControlButton>
        {status === 'stopped' && (
          <ControlButton title="Play" onClick={onPlay} primary>
            <Play className="w-3.5 h-3.5" />
          </ControlButton>
        )}
        {status === 'playing' && (
          <ControlButton title="Pause" onClick={onPause}>
            <Pause className="w-3.5 h-3.5" />
          </ControlButton>
        )}
        {status === 'paused' && (
          <ControlButton title="Resume" onClick={onResume} primary>
            <Play className="w-3.5 h-3.5" />
          </ControlButton>
        )}
        <ControlButton title="Stop" onClick={onStop} disabled={status === 'stopped'}>
          <Square className="w-3.5 h-3.5" />
        </ControlButton>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted font-mono">Speed</span>
        {SPEEDS.map(s => (
          <button
            key={s}
            onClick={() => onSpeed(s)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors',
              speed === s
                ? 'bg-accent text-surface'
                : 'text-text-muted hover:text-text-primary hover:bg-panel-light',
            )}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}

function ControlButton({
  children, onClick, title, primary, disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer',
        primary
          ? 'bg-accent text-surface hover:opacity-90'
          : 'text-text-secondary hover:text-text-primary hover:bg-panel-light',
        disabled && 'opacity-30 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  )
}

function SummaryStat({
  label, value, tone = 'neutral', mono,
}: {
  label: string
  value: string
  tone?: 'long' | 'short' | 'neutral'
  mono?: boolean
}) {
  const toneClass = tone === 'long' ? 'text-long' : tone === 'short' ? 'text-short' : 'text-text-primary'
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted font-mono">{label}</span>
      <span className={cn(toneClass, mono && 'font-mono tabular-nums')}>{value}</span>
    </div>
  )
}

interface RunningSummary {
  realizedPnl: number
  wins: number
  losses: number
  closed: BacktestTrade[]
  openTrade: BacktestTrade | null
}

function computeRunningSummary(trades: BacktestTrade[], cur: number): RunningSummary {
  let realizedPnl = 0
  let wins = 0
  let losses = 0
  const closed: BacktestTrade[] = []
  let openTrade: BacktestTrade | null = null

  for (const t of trades) {
    if (t.openedAtIdx > cur) continue
    if (t.closedAtIdx <= cur) {
      closed.push(t)
      realizedPnl += t.pnlUsd
      if (t.pnlUsd >= 0) wins++; else losses++
    } else {
      openTrade = t
    }
  }
  return { realizedPnl, wins, losses, closed, openTrade }
}
