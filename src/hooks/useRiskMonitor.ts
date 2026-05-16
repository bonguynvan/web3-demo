/**
 * useRiskMonitor — watches portfolio-level metrics against the configured
 * caps in riskStore and auto-pauses every bot when one is breached.
 *
 * Mounted once globally in AppShell. Cheap polling — recomputes on every
 * trades change plus a 10s heartbeat for the unrealized component.
 *
 * Three independent caps (any one fires):
 *   - dailyPnlCapUsd: realized loss in the last 24h.
 *   - maxDrawdownUsd: peak realized minus current realized cumulative PnL.
 *   - maxExposureUsd: sum of open trade notional.
 *
 * Two-tier notification:
 *   - ≥80% utilization: toast.warning, throttled per-cap to once / 30 min
 *     via riskStore.lastWarnedAt. Lets the user act before bots get paused.
 *   - ≥100%: full breach — bots disabled, toast.error, breach record set.
 *
 * The breach is cleared automatically once no cap is in violation, so
 * raising a limit re-enables the engine without a manual clear step.
 */

import { useEffect, useState } from 'react'
import { useBotStore } from '../store/botStore'
import { useRiskStore, type RiskCapKind } from '../store/riskStore'
import { useToast } from '../store/toastStore'

const TICK_MS = 10_000
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const WARN_THRESHOLD = 0.8
const WARN_COOLDOWN_MS = 30 * 60 * 1000

export function useRiskMonitor(): void {
  const trades = useBotStore(s => s.trades)
  const setAllEnabled = useBotStore(s => s.setAllEnabled)
  const dailyPnlCapUsd = useRiskStore(s => s.dailyPnlCapUsd)
  const maxDrawdownUsd = useRiskStore(s => s.maxDrawdownUsd)
  const maxExposureUsd = useRiskStore(s => s.maxExposureUsd)
  const breach = useRiskStore(s => s.breach)
  const lastWarnedAt = useRiskStore(s => s.lastWarnedAt)
  const setBreach = useRiskStore(s => s.setBreach)
  const clearBreach = useRiskStore(s => s.clearBreach)
  const markWarned = useRiskStore(s => s.markWarned)
  const toast = useToast()

  // Heartbeat for re-evaluation; trades changes already trigger reruns.
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const cutoff = Date.now() - ONE_DAY_MS
    const closedSorted = trades
      .filter(t => t.closedAt !== undefined && t.pnlUsd !== undefined)
      .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))

    let realizedToday = 0
    for (const t of closedSorted) {
      if ((t.closedAt ?? 0) >= cutoff) realizedToday += t.pnlUsd ?? 0
    }

    let peak = 0
    let cum = 0
    let drawdown = 0
    for (const t of closedSorted) {
      cum += t.pnlUsd ?? 0
      if (cum > peak) peak = cum
      const dd = peak - cum
      if (dd > drawdown) drawdown = dd
    }

    const exposure = trades
      .filter(t => t.closedAt === undefined)
      .reduce((s, t) => s + t.positionUsd, 0)

    // Per-cap utilization (0..1+). 0 means cap is off (not configured).
    const dailyUtil = dailyPnlCapUsd > 0 && realizedToday < 0
      ? Math.abs(realizedToday) / dailyPnlCapUsd
      : 0
    const drawdownUtil = maxDrawdownUsd > 0 ? drawdown / maxDrawdownUsd : 0
    const exposureUtil = maxExposureUsd > 0 ? exposure / maxExposureUsd : 0

    const reasons: string[] = []
    if (dailyUtil >= 1) reasons.push(`Daily loss cap ($${realizedToday.toFixed(2)} ≤ -$${dailyPnlCapUsd})`)
    if (drawdownUtil >= 1) reasons.push(`Drawdown cap ($${drawdown.toFixed(2)} ≥ $${maxDrawdownUsd})`)
    if (exposureUtil >= 1) reasons.push(`Exposure cap ($${exposure.toFixed(2)} ≥ $${maxExposureUsd})`)

    if (reasons.length > 0 && !breach) {
      const reason = reasons.join(' · ')
      setBreach(reason)
      setAllEnabled(false)
      toast.error('Risk cap breached — bots paused', reason)
      return
    }

    if (reasons.length === 0 && breach) {
      clearBreach()
    }

    // Proactive warnings — only while no breach is active so we don't
    // duplicate alarms.
    if (reasons.length === 0) {
      const now = Date.now()
      const checks: Array<{ kind: RiskCapKind; util: number; label: string }> = [
        { kind: 'daily', util: dailyUtil, label: `Daily loss at ${(dailyUtil * 100).toFixed(0)}% of cap` },
        { kind: 'drawdown', util: drawdownUtil, label: `Drawdown at ${(drawdownUtil * 100).toFixed(0)}% of cap` },
        { kind: 'exposure', util: exposureUtil, label: `Exposure at ${(exposureUtil * 100).toFixed(0)}% of cap` },
      ]
      for (const c of checks) {
        if (c.util >= WARN_THRESHOLD && c.util < 1 && now - (lastWarnedAt[c.kind] ?? 0) >= WARN_COOLDOWN_MS) {
          toast.warning('Approaching risk cap', c.label)
          markWarned(c.kind)
        }
      }
    }
  }, [trades, dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd, breach, lastWarnedAt, setBreach, clearBreach, setAllEnabled, markWarned, toast])
}
