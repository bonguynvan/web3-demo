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
 * On breach we call botStore.setAllEnabled(false) and toast.error().
 * The breach is cleared automatically once no cap is in violation, so
 * raising a limit re-enables the engine without a manual clear step.
 */

import { useEffect, useState } from 'react'
import { useBotStore } from '../store/botStore'
import { useRiskStore } from '../store/riskStore'
import { useToast } from '../store/toastStore'

const TICK_MS = 10_000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function useRiskMonitor(): void {
  const trades = useBotStore(s => s.trades)
  const setAllEnabled = useBotStore(s => s.setAllEnabled)
  const dailyPnlCapUsd = useRiskStore(s => s.dailyPnlCapUsd)
  const maxDrawdownUsd = useRiskStore(s => s.maxDrawdownUsd)
  const maxExposureUsd = useRiskStore(s => s.maxExposureUsd)
  const breach = useRiskStore(s => s.breach)
  const setBreach = useRiskStore(s => s.setBreach)
  const clearBreach = useRiskStore(s => s.clearBreach)
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

    const reasons: string[] = []
    if (dailyPnlCapUsd > 0 && realizedToday <= -dailyPnlCapUsd) {
      reasons.push(`Daily loss cap ($${realizedToday.toFixed(2)} ≤ -$${dailyPnlCapUsd})`)
    }
    if (maxDrawdownUsd > 0 && drawdown >= maxDrawdownUsd) {
      reasons.push(`Drawdown cap ($${drawdown.toFixed(2)} ≥ $${maxDrawdownUsd})`)
    }
    if (maxExposureUsd > 0 && exposure >= maxExposureUsd) {
      reasons.push(`Exposure cap ($${exposure.toFixed(2)} ≥ $${maxExposureUsd})`)
    }

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
  }, [trades, dailyPnlCapUsd, maxDrawdownUsd, maxExposureUsd, breach, setBreach, clearBreach, setAllEnabled, toast])
}
