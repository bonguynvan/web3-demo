/**
 * useFuturesPositions — reactive hook for futures positions with price updates.
 *
 * Polls the futures data store for structural changes and recalculates
 * PnL from live prices.
 */

import { useState, useEffect, useCallback } from 'react'
import { getFuturesPositions, getFuturesVersion, getFuturesHistory } from '../lib/futuresData'
import { usePrices } from './usePrices'
import type { FuturesPosition, FuturesSettlementRecord } from '../types/futures'

export function useFuturesPositions() {
  const { getPrice } = usePrices()
  const [positions, setPositions] = useState<FuturesPosition[]>([])
  const [history, setHistory] = useState<FuturesSettlementRecord[]>([])

  const getPriceNum = useCallback(
    (market: string): number | undefined => {
      const p = getPrice(market)
      return p?.price
    },
    [getPrice],
  )

  useEffect(() => {
    let lastVersion = -1
    const interval = setInterval(() => {
      const currentVersion = getFuturesVersion()
      // Always update positions for price changes, but only
      // update history on structural changes
      const newPositions = getFuturesPositions(getPriceNum)
      setPositions(newPositions)

      if (currentVersion !== lastVersion) {
        lastVersion = currentVersion
        setHistory(getFuturesHistory())
      }
    }, 1000)

    // Initial load
    setPositions(getFuturesPositions(getPriceNum))
    setHistory(getFuturesHistory())

    return () => clearInterval(interval)
  }, [getPriceNum])

  const activePositions = positions.filter(p => !p.isSettled)
  const settledPositions = positions.filter(p => p.isSettled)

  return {
    positions: activePositions,
    settledPositions,
    history,
    totalCount: activePositions.length,
  }
}
