/**
 * useDocumentTitle — keeps the browser tab title in sync with the active
 * market and its live price, like Binance / Bybit / dYdX.
 *
 * Format:
 *   "$3,500.42 ETH-PERP · Perp DEX"  when a price is available
 *   "Perp DEX"                       when waiting on the first tick
 *
 * Throttling: the price hooks tick on every Binance frame (~1s) and every
 * oracle poll (~3s). Updating document.title every tick is fine — it's a
 * cheap DOM string write — but coalesce via a 1s minimum interval anyway
 * so we never write more than once per second even if the tab is hidden
 * and we get a flood of buffered updates on focus.
 *
 * Restores the original title on unmount so the App component can be
 * unmounted in tests / Storybook without leaking the last price.
 */

import { useEffect, useRef } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from './usePrices'
import { formatUsd } from '../lib/format'

const BASE_TITLE = 'Perp DEX'
const MIN_INTERVAL_MS = 1000

export function useDocumentTitle(): void {
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const { getPrice } = usePrices()

  const currentPrice = getPrice(selectedMarket.symbol)
  const price = currentPrice?.price ?? 0

  // Track the last applied title + when so we can throttle without React state.
  const lastWriteAtRef = useRef(0)
  const lastTitleRef = useRef('')

  useEffect(() => {
    const next = price > 0
      ? `$${formatUsd(price)} ${selectedMarket.symbol} · ${BASE_TITLE}`
      : BASE_TITLE

    if (next === lastTitleRef.current) return

    const now = Date.now()
    if (now - lastWriteAtRef.current < MIN_INTERVAL_MS) {
      // Schedule a single deferred write so we don't drop the latest price
      // when many ticks arrive within the throttle window.
      const wait = MIN_INTERVAL_MS - (now - lastWriteAtRef.current)
      const timer = setTimeout(() => {
        document.title = next
        lastTitleRef.current = next
        lastWriteAtRef.current = Date.now()
      }, wait)
      return () => clearTimeout(timer)
    }

    document.title = next
    lastTitleRef.current = next
    lastWriteAtRef.current = now
  }, [price, selectedMarket.symbol])

  // Reset to base title when the consumer unmounts.
  useEffect(() => {
    return () => {
      document.title = BASE_TITLE
    }
  }, [])
}
