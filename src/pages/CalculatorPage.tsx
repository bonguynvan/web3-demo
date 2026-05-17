/**
 * CalculatorPage — standalone position-sizing calculator.
 *
 * The pro habit: before every manual trade, verify the size.
 *   Given: equity, risk %, entry price, stop price
 *   Compute: notional USD, units, leverage, dollars at risk, R:R if target set
 *
 * Useful outside the bot framework — for manual trades on any venue.
 * Reads accountEquityUsd from riskStore as a default; user can override.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Calculator, AlertTriangle, Copy } from 'lucide-react'
import { useDocumentMeta } from '../lib/documentMeta'
import { useRiskStore } from '../store/riskStore'
import { useToast } from '../store/toastStore'
import { cn } from '../lib/format'

type Side = 'long' | 'short'

export function CalculatorPage() {
  useDocumentMeta({
    title: 'TradingDek — Position calculator',
    description: 'Size a trade by risk % of equity. Compute notional, units, leverage.',
    canonical: '/calc',
  })

  const equityFromStore = useRiskStore(s => s.accountEquityUsd)
  const setRiskLimits = useRiskStore(s => s.setLimits)
  const toast = useToast()

  const [side, setSide] = useState<Side>('long')
  const [equity, setEquity] = useState<string>(equityFromStore > 0 ? String(equityFromStore) : '')
  const [riskPct, setRiskPct] = useState<string>('0.5')
  const [entry, setEntry] = useState<string>('')
  const [stop, setStop] = useState<string>('')
  const [target, setTarget] = useState<string>('')

  const equityNum = Number(equity) || 0
  const riskPctNum = Number(riskPct) || 0
  const entryNum = Number(entry) || 0
  const stopNum = Number(stop) || 0
  const targetNum = Number(target) || 0

  const result = useMemo(() => {
    if (equityNum <= 0 || riskPctNum <= 0 || entryNum <= 0 || stopNum <= 0) return null
    if (side === 'long' && stopNum >= entryNum) return { error: 'Stop must be below entry for a long.' }
    if (side === 'short' && stopNum <= entryNum) return { error: 'Stop must be above entry for a short.' }

    const dollarsAtRisk = equityNum * (riskPctNum / 100)
    const stopDistanceAbs = Math.abs(entryNum - stopNum)
    const stopPct = (stopDistanceAbs / entryNum) * 100
    const units = dollarsAtRisk / stopDistanceAbs
    const notional = units * entryNum
    const leverage = notional / equityNum

    let rewardToRisk: number | null = null
    let targetPct: number | null = null
    if (targetNum > 0) {
      if (side === 'long' && targetNum > entryNum) {
        rewardToRisk = (targetNum - entryNum) / stopDistanceAbs
        targetPct = ((targetNum - entryNum) / entryNum) * 100
      } else if (side === 'short' && targetNum < entryNum && targetNum > 0) {
        rewardToRisk = (entryNum - targetNum) / stopDistanceAbs
        targetPct = ((entryNum - targetNum) / entryNum) * 100
      }
    }

    return {
      dollarsAtRisk,
      stopPct,
      units,
      notional,
      leverage,
      rewardToRisk,
      targetPct,
    }
  }, [side, equityNum, riskPctNum, entryNum, stopNum, targetNum])

  const handleSaveEquity = () => {
    if (equityNum > 0) {
      setRiskLimits({ accountEquityUsd: equityNum })
      toast.success('Equity saved', `Stored as account equity for risk-pct sizing.`)
    }
  }

  const handleCopyShare = () => {
    if (!result || 'error' in result) return
    const summary = [
      `${side.toUpperCase()} sizing:`,
      `  Equity:    $${equityNum.toLocaleString()}`,
      `  Risk:      ${riskPctNum}% = $${result.dollarsAtRisk.toFixed(2)}`,
      `  Entry:     ${entryNum}`,
      `  Stop:      ${stopNum} (${result.stopPct.toFixed(2)}%)`,
      target ? `  Target:    ${targetNum} (R:R ${result.rewardToRisk?.toFixed(2) ?? '—'})` : null,
      ``,
      `  Notional:  $${result.notional.toFixed(2)}`,
      `  Units:     ${result.units.toFixed(6)}`,
      `  Leverage:  ${result.leverage.toFixed(2)}x`,
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(summary).catch(() => {})
    toast.success('Copied', 'Position sizing summary on your clipboard.')
  }

  const hasError = result && 'error' in result
  const leverageWarn = result && !('error' in result) && result.leverage > 5

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-2xl mx-auto px-4 md:px-8 py-6 space-y-5">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Calculator className="w-5 h-5 text-accent" />
              Position calculator
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Size by risk % of equity. Sanity-check every trade.
            </p>
          </div>
          <Link
            to="/profile"
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-accent/40 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Profile
          </Link>
        </header>

        <div className="rounded-lg border border-border bg-panel/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide('long')}
              className={cn(
                'px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer',
                side === 'long'
                  ? 'bg-long/20 text-long border-long/40'
                  : 'bg-panel text-text-muted border-border hover:text-text-primary',
              )}
            >
              Long
            </button>
            <button
              onClick={() => setSide('short')}
              className={cn(
                'px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer',
                side === 'short'
                  ? 'bg-short/20 text-short border-short/40'
                  : 'bg-panel text-text-muted border-border hover:text-text-primary',
              )}
            >
              Short
            </button>
          </div>

          <Field label="Account equity (USD)">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={100}
                value={equity}
                onChange={e => setEquity(e.target.value)}
                placeholder="e.g. 10000"
                className="flex-1 bg-panel border border-border rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-accent"
              />
              {equityNum > 0 && equityNum !== equityFromStore && (
                <button
                  onClick={handleSaveEquity}
                  className="px-2 py-1 text-[10px] uppercase tracking-wider rounded bg-surface border border-border text-text-muted hover:text-text-primary cursor-pointer"
                  title="Save as default for future sessions + bot risk-pct sizing"
                >
                  Save default
                </button>
              )}
            </div>
          </Field>

          <Field label="Risk % per trade">
            <input
              type="number"
              min={0}
              step={0.05}
              value={riskPct}
              onChange={e => setRiskPct(e.target.value)}
              className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-accent"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Entry price">
              <input
                type="number"
                min={0}
                step="any"
                value={entry}
                onChange={e => setEntry(e.target.value)}
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-accent"
              />
            </Field>
            <Field label="Stop price">
              <input
                type="number"
                min={0}
                step="any"
                value={stop}
                onChange={e => setStop(e.target.value)}
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-short font-mono outline-none focus:border-short"
              />
            </Field>
          </div>

          <Field label="Target price (optional — for R:R)">
            <input
              type="number"
              min={0}
              step="any"
              value={target}
              onChange={e => setTarget(e.target.value)}
              className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-long font-mono outline-none focus:border-long"
            />
          </Field>
        </div>

        {hasError ? (
          <div className="rounded-md border border-short/40 bg-short/10 text-short px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>{(result as { error: string }).error}</div>
          </div>
        ) : result ? (
          <div className="rounded-lg border border-border bg-panel/30 p-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[11px] uppercase tracking-[0.18em] font-mono font-semibold text-text-secondary">
                Sizing
              </h2>
              <button
                onClick={handleCopyShare}
                className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>
            <ResultRow label="Notional" value={`$${result.notional.toFixed(2)}`} highlight />
            <ResultRow label="Units" value={result.units.toFixed(6)} />
            <ResultRow
              label="Leverage"
              value={`${result.leverage.toFixed(2)}x`}
              tone={leverageWarn ? 'warning' : 'neutral'}
            />
            <div className="border-t border-border my-2" />
            <ResultRow label="Dollars at risk" value={`$${result.dollarsAtRisk.toFixed(2)}`} tone="short" />
            <ResultRow label="Stop distance" value={`${result.stopPct.toFixed(2)}%`} />
            {result.rewardToRisk !== null && result.targetPct !== null && (
              <>
                <ResultRow
                  label="Target distance"
                  value={`${result.targetPct.toFixed(2)}%`}
                  tone="long"
                />
                <ResultRow
                  label="Reward : Risk"
                  value={`${result.rewardToRisk.toFixed(2)} : 1`}
                  tone={result.rewardToRisk >= 2 ? 'long' : result.rewardToRisk >= 1 ? 'neutral' : 'short'}
                />
              </>
            )}
            {leverageWarn && (
              <div className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-300">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>Leverage &gt; 5x — liquidation risk if stop is far. Tighten stop or reduce risk %.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-panel/30 px-4 py-6 text-center text-xs text-text-muted">
            Fill in equity, risk %, entry, and stop to size the trade.
          </div>
        )}
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1 font-mono">
        {label}
      </label>
      {children}
    </div>
  )
}

function ResultRow({ label, value, tone = 'neutral', highlight }: {
  label: string; value: string; tone?: 'long' | 'short' | 'warning' | 'neutral'; highlight?: boolean
}) {
  const toneCls = tone === 'long' ? 'text-long'
    : tone === 'short' ? 'text-short'
    : tone === 'warning' ? 'text-amber-300'
    : highlight ? 'text-accent'
    : 'text-text-primary'
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-muted font-mono uppercase tracking-wider">{label}</span>
      <span className={cn('font-mono font-semibold tabular-nums', highlight && 'text-lg', toneCls)}>
        {value}
      </span>
    </div>
  )
}
