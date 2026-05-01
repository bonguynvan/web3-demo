/**
 * useSignalPerformanceTracker — records new signals and resolves
 * expired ones every 30s. Mount once near the app root.
 */

import { useEffect } from 'react'
import { getActiveAdapter } from '../adapters/registry'
import { useSignalPerformanceStore } from '../store/signalPerformanceStore'
import type { Signal } from '../signals/types'

const RESOLVE_INTERVAL_MS = 30_000

function getPrice(marketId: string): number | undefined {
  const t = getActiveAdapter().getTicker(marketId)
  return t?.last
}

export function useSignalPerformanceTracker(signals: Signal[]): void {
  const recordSignal = useSignalPerformanceStore(s => s.recordSignal)
  const resolvePending = useSignalPerformanceStore(s => s.resolvePending)

  useEffect(() => {
    for (const s of signals) {
      const entry = s.suggestedPrice ?? getPrice(s.marketId)
      if (entry != null) recordSignal(s, entry)
    }
  }, [signals, recordSignal])

  useEffect(() => {
    const tick = () => resolvePending(Date.now(), getPrice)
    tick()
    const id = setInterval(tick, RESOLVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [resolvePending])
}
