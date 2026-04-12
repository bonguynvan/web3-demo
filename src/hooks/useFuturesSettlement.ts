/**
 * useFuturesSettlement — auto-settlement engine for expired futures.
 *
 * Runs a 1-second interval checking for positions past expiry.
 * Settles them at the current mark price and fires toast notifications.
 * Also handles visibility change events for background tab recovery.
 */

import { useEffect, useRef } from 'react'
import { getUnsettledExpired, settleFuturesPosition, cleanupSettledPositions } from '../lib/futuresData'
import { usePrices } from './usePrices'
import { useToast } from '../store/toastStore'
import { formatUsd } from '../lib/format'

export function useFuturesSettlement() {
  const { getPrice } = usePrices()
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast

  useEffect(() => {
    const settle = () => {
      const expired = getUnsettledExpired()
      if (expired.length === 0) return

      for (const pos of expired) {
        const priceData = getPrice(pos.market)
        const currentPrice = priceData?.price
        if (!currentPrice || currentPrice <= 0) continue

        const result = settleFuturesPosition(pos.id, currentPrice)
        if (result) {
          const pnlStr = `${result.pnl >= 0 ? '+' : ''}$${formatUsd(Math.abs(result.pnl))}`
          toastRef.current.success(
            `${pos.market} ${pos.tenor} settled`,
            `${pos.side === 'long' ? 'Long' : 'Short'} at $${formatUsd(result.settlementPrice)} — P&L: ${pnlStr}`,
          )
        }
      }

      // Clean up settled positions after a short delay
      setTimeout(() => cleanupSettledPositions(), 5000)
    }

    // Check every second
    const interval = setInterval(settle, 1000)

    // Also check on visibility change (tab coming back to foreground)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') settle()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [getPrice])
}
