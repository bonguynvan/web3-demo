/**
 * useFuturesPositions — reactive hook for futures positions with price updates.
 *
 * Polls the futures data store for structural changes and recalculates
 * PnL from live prices.
 */

import { useState, useEffect, useRef } from 'react'
import { getFuturesPositions, getFuturesVersion, getFuturesHistory } from '../lib/futuresData'
import { usePrices } from './usePrices'
import type { FuturesPosition, FuturesSettlementRecord } from '../types/futures'

export function useFuturesPositions() {
  const { getPrice } = usePrices()
  const [positions, setPositions] = useState<FuturesPosition[]>([])
  const [history, setHistory] = useState<FuturesSettlementRecord[]>([])

  // Stable ref so the interval always reads the latest getPrice without
  // restarting the effect on every price tick (which caused an infinite
  // setState → re-render → effect → setState loop).
  const getPriceRef = useRef(getPrice)
  getPriceRef.current = getPrice

  useEffect(() => {
    const getPriceNum = (market: string): number | undefined =>
      getPriceRef.current(market)?.price

    let lastVersion = -1
    const interval = setInterval(() => {
      const currentVersion = getFuturesVersion()
      // Always update positions for price changes, but only
      // update history on structural changes
      setPositions(getFuturesPositions(getPriceNum))

      if (currentVersion !== lastVersion) {
        lastVersion = currentVersion
        setHistory(getFuturesHistory())
      }
    }, 1000)

    // Initial load
    setPositions(getFuturesPositions(getPriceNum))
    setHistory(getFuturesHistory())

    return () => clearInterval(interval)
  }, []) // empty deps — interval + ref handle updates

  const activePositions = positions.filter(p => !p.isSettled)
  const settledPositions = positions.filter(p => p.isSettled)

  return {
    positions: activePositions,
    settledPositions,
    history,
    totalCount: activePositions.length,
  }
}
