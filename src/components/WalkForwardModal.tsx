/**
 * WalkForwardModal — parameter sweep + train/test validation UI.
 *
 * Visualizes the runWalkForward result as a heatmap (SL × TP cells
 * colored by train PnL) with a side table showing the top-K configs
 * and their TEST PnL + generalization ratio.
 *
 * A config that's green on TRAIN but red on TEST = overfit.
 * A config that's positive on both = robust (more likely to generalize).
 */

import { useMemo, useState } from 'react'
import { Activity, AlertTriangle } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useBotStore } from '../store/botStore'
import { useTradingStore } from '../store/tradingStore'
import { runWalkForward, type WalkForwardResult, type SweepCell } from '../bots/walkForward'
import { cn, formatUsd } from '../lib/format'

interface Props {
  open: boolean
  onClose: () => void
  /** Which bot's config to use as the base. */
  baseBotId?: string
}

export function WalkForwardModal({ open, onClose, baseBotId }: Props) {
  const bots = useBotStore(s => s.bots)
  const candles = useTradingStore(s => s.candles)
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  const baseBot = useMemo(
    () => bots.find(b => b.id === baseBotId) ?? bots[0],
    [bots, baseBotId],
  )

  // Sweep params (UI-tunable).
  const [slMin, setSlMin] = useState(0.5)
  const [slMax, setSlMax] = useState(3.0)
  const [slStep, setSlStep] = useState(0.5)
  const [tpMin, setTpMin] = useState(1.0)
  const [tpMax, setTpMax] = useState(6.0)
  const [tpStep, setTpStep] = useState(1.0)
  const [trainFraction, setTrainFraction] = useState(0.6)

  const [result, setResult] = useState<WalkForwardResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slCount = Math.floor((slMax - slMin) / slStep) + 1
  const tpCount = Math.floor((tpMax - tpMin) / tpStep) + 1
  const totalCells = Math.max(0, slCount * tpCount)

  const run = () => {
    if (!baseBot) {
      setError('No bot selected.')
      return
    }
    if (candles.length < 100) {
      setError('Need at least 100 candles on the active market.')
      return
    }
    setError(null)
    setRunning(true)
    // Wrap in a tiny timeout so the loading state paints before the
    // (synchronous) sweep blocks the main thread.
    setTimeout(() => {
      try {
        const r = runWalkForward({
          baseConfig: baseBot,
          marketId: selectedMarket.symbol,
          candles,
          trainFraction,
          axes: [
            { field: 'stopLossPct', min: slMin, max: slMax, step: slStep },
            { field: 'takeProfitPct', min: tpMin, max: tpMax, step: tpStep },
          ],
          topK: 5,
        })
        setResult(r)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setRunning(false)
      }
    }, 30)
  }

  // Color scale for the heatmap, centered on $0.
  const maxAbsPnl = useMemo(() => {
    if (!result) return 1
    return Math.max(1, ...result.cells.map(c => Math.abs(c.trainPnl)))
  }, [result])

  return (
    <Modal open={open} onClose={onClose} title="Walk-forward backtest" maxWidth="max-w-4xl">
      <div className="p-4 space-y-4">
        {!baseBot ? (
          <div className="text-sm text-text-muted">Create a bot first to use this tool.</div>
        ) : (
          <>
            <div className="rounded-md bg-panel/40 border border-border px-3 py-2 text-[11px] text-text-secondary leading-relaxed">
              <div className="font-semibold text-text-primary mb-1">How this works</div>
              Splits {candles.length} candles into TRAIN ({Math.round(trainFraction * 100)}%) and TEST
              ({Math.round((1 - trainFraction) * 100)}%). Sweeps each SL × TP cell on TRAIN, picks the top
              5 by PnL, then validates them on TEST. Configs that win on both generalize. Configs that only
              win on TRAIN were lucky.
            </div>

            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <SweepInput label="SL min %" value={slMin} setValue={setSlMin} />
              <SweepInput label="SL max %" value={slMax} setValue={setSlMax} />
              <SweepInput label="SL step %" value={slStep} setValue={setSlStep} />
              <SweepInput label="TP min %" value={tpMin} setValue={setTpMin} />
              <SweepInput label="TP max %" value={tpMax} setValue={setTpMax} />
              <SweepInput label="TP step %" value={tpStep} setValue={setTpStep} />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-text-muted font-mono uppercase">Train split</span>
                <input
                  type="range"
                  min={0.3}
                  max={0.8}
                  step={0.05}
                  value={trainFraction}
                  onChange={e => setTrainFraction(Number(e.target.value))}
                  className="w-32 accent-accent"
                />
                <span className="text-xs font-mono">{Math.round(trainFraction * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-muted">
                  {totalCells} cell{totalCells === 1 ? '' : 's'} ({slCount} × {tpCount})
                </span>
                <button
                  onClick={run}
                  disabled={running || totalCells > 400 || totalCells < 1}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Activity className="w-3 h-3" />
                  {running ? 'Running…' : 'Run sweep'}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-short/40 bg-short/10 text-short px-3 py-2 text-xs flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-[11px] uppercase tracking-[0.18em] font-mono font-semibold text-text-secondary mb-2">
                    Train heatmap (PnL)
                  </h3>
                  <Heatmap result={result} maxAbs={maxAbsPnl} />
                  <div className="mt-1 text-[10px] text-text-muted">
                    {result.trainBars} train bars · {result.testBars} test bars. Hotter = more PnL on TRAIN.
                  </div>
                </div>
                <div>
                  <h3 className="text-[11px] uppercase tracking-[0.18em] font-mono font-semibold text-text-secondary mb-2">
                    Top 5 configs · validated on TEST
                  </h3>
                  <TopKTable cells={result.topK} />
                  <div className="mt-1 text-[10px] text-text-muted">
                    Generalization &gt; 0.5 = robust. &lt; 0 = train wins flipped to test losses.
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md bg-surface text-text-muted border border-border hover:text-text-primary transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SweepInput({ label, value, setValue }: { label: string; value: number; setValue: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[9px] uppercase tracking-wider text-text-muted mb-0.5 font-mono">
        {label}
      </label>
      <input
        type="number"
        min={0}
        step="0.1"
        value={value}
        onChange={e => setValue(Math.max(0, Number(e.target.value)))}
        className="w-full bg-panel border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-accent"
      />
    </div>
  )
}

function Heatmap({ result, maxAbs }: { result: WalkForwardResult; maxAbs: number }) {
  // Build a grid from the cells: rows = SL, cols = TP.
  const slValues = Array.from(new Set(result.cells.map(c => c.slPct))).sort((a, b) => a - b)
  const tpValues = Array.from(new Set(result.cells.map(c => c.tpPct))).sort((a, b) => a - b)
  const byKey = new Map(result.cells.map(c => [`${c.slPct}_${c.tpPct}`, c]))

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-panel/30 p-2">
      <table className="text-[10px] font-mono">
        <thead>
          <tr>
            <th className="text-text-muted px-1.5 py-0.5">SL ↓ / TP →</th>
            {tpValues.map(tp => (
              <th key={tp} className="text-text-muted px-1.5 py-0.5 tabular-nums">{tp.toFixed(1)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slValues.map(sl => (
            <tr key={sl}>
              <td className="text-text-muted px-1.5 py-0.5 tabular-nums">{sl.toFixed(1)}</td>
              {tpValues.map(tp => {
                const c = byKey.get(`${sl}_${tp}`)
                if (!c) return <td key={tp} />
                const intensity = Math.min(1, Math.abs(c.trainPnl) / maxAbs)
                const bg = c.trainPnl >= 0
                  ? `rgba(38, 217, 132, ${0.15 + intensity * 0.45})`
                  : `rgba(255, 93, 109, ${0.15 + intensity * 0.45})`
                return (
                  <td
                    key={tp}
                    className="px-1.5 py-0.5 text-center tabular-nums"
                    style={{ background: bg }}
                    title={`SL ${sl}% · TP ${tp}% · ${c.trainTrades} trades · ${(c.trainWinRate * 100).toFixed(0)}% win`}
                  >
                    {c.trainPnl >= 0 ? '+' : ''}{c.trainPnl.toFixed(0)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TopKTable({ cells }: { cells: SweepCell[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-[10px] font-mono">
        <thead className="bg-panel/60">
          <tr>
            <th className="text-left px-2 py-1 uppercase tracking-wider">SL</th>
            <th className="text-left px-2 py-1 uppercase tracking-wider">TP</th>
            <th className="text-right px-2 py-1 uppercase tracking-wider">Train PnL</th>
            <th className="text-right px-2 py-1 uppercase tracking-wider">Test PnL</th>
            <th className="text-right px-2 py-1 uppercase tracking-wider">Test win</th>
            <th className="text-right px-2 py-1 uppercase tracking-wider">Gen</th>
          </tr>
        </thead>
        <tbody>
          {cells.map(c => {
            const gen = c.generalization ?? 0
            const genClass = gen >= 0.5 ? 'text-long' : gen > 0 ? 'text-amber-300' : 'text-short'
            const testPnlClass = (c.testPnl ?? 0) > 0 ? 'text-long' : (c.testPnl ?? 0) < 0 ? 'text-short' : 'text-text-muted'
            return (
              <tr key={`${c.slPct}_${c.tpPct}`} className="border-t border-border">
                <td className="px-2 py-1 tabular-nums">{c.slPct.toFixed(1)}%</td>
                <td className="px-2 py-1 tabular-nums">{c.tpPct.toFixed(1)}%</td>
                <td className="px-2 py-1 text-right tabular-nums text-long">
                  +${formatUsd(c.trainPnl)}
                </td>
                <td className={cn('px-2 py-1 text-right tabular-nums', testPnlClass)}>
                  {(c.testPnl ?? 0) >= 0 ? '+' : ''}${formatUsd(c.testPnl ?? 0)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {c.testTrades && c.testTrades > 0 ? `${((c.testWinRate ?? 0) * 100).toFixed(0)}%` : '—'}
                </td>
                <td className={cn('px-2 py-1 text-right tabular-nums font-semibold', genClass)}>
                  {gen.toFixed(2)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
