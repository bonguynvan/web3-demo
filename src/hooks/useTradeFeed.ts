/**
 * useTradeFeed — populates the recentTrades store.
 *
 * Demo mode: synthetic generator that fakes a realistic flow with bursts,
 *            power-law sizes, and momentum-biased side selection.
 *
 * Live mode: delegates to useOnChainTrades, which backfills + polls
 *            PositionManager events from the chain.
 *
 * Both paths feed the same `tradingStore.addTrade` action, so RecentTrades
 * doesn't have to know which source is active.
 *
 * Refs are used to keep the demo timer stable across getPrice re-renders
 * (every price tick changes the function reference, which would otherwise
 * destroy the timer mid-flight).
 */

import { useEffect, useRef } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from './usePrices'
import { useIsDemo } from '../store/modeStore'
import type { Trade } from '../types/trading'

export function useTradeFeed() {
  const isDemo = useIsDemo()
  useDemoTradeFeed(isDemo)
}

function useDemoTradeFeed(isDemo: boolean) {
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const addTrade = useTradingStore(s => s.addTrade)
  const { getPrice } = usePrices()

  // Stable refs — don't trigger effect re-runs
  const getPriceRef = useRef(getPrice)
  const marketRef = useRef(selectedMarket.symbol)
  const addTradeRef = useRef(addTrade)
  getPriceRef.current = getPrice
  marketRef.current = selectedMarket.symbol
  addTradeRef.current = addTrade

  const lastPriceRef = useRef(0)
  const tradeIdRef = useRef(0)

  useEffect(() => {
    if (!isDemo) return

    let active = true
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const generateTrade = () => {
      if (!active) return

      const currentPrice = getPriceRef.current(marketRef.current)
      const price = currentPrice?.price ?? lastPriceRef.current
      if (price === 0) {
        timeoutId = setTimeout(generateTrade, 1000)
        return
      }

      const direction = price > lastPriceRef.current ? 'up' : 'down'
      lastPriceRef.current = price

      const spreadNoise = price * (Math.random() - 0.5) * 0.0002
      const tradePrice = price + spreadNoise

      // Power-law size distribution
      const r = Math.random()
      const size = r < 0.6 ? 0.01 + Math.random() * 0.5
        : r < 0.9 ? 0.5 + Math.random() * 5
        : r < 0.98 ? 5 + Math.random() * 20
        : 20 + Math.random() * 100

      const sideBias = direction === 'up' ? 0.6 : 0.4
      const side = (Math.random() < sideBias ? 'long' : 'short') as 'long' | 'short'

      const trade: Trade = {
        id: `t-${++tradeIdRef.current}`,
        price: +tradePrice.toFixed(2),
        size: +size.toFixed(4),
        side,
        time: Date.now(),
      }

      addTradeRef.current(trade)

      // Next trade — clustered (bursts then quiet)
      const burstPhase = Math.sin(Date.now() / 3000) > 0
      const baseInterval = burstPhase ? 80 : 400
      const jitter = Math.random() * baseInterval
      timeoutId = setTimeout(generateTrade, baseInterval + jitter)
    }

    timeoutId = setTimeout(generateTrade, 500)

    return () => {
      active = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [isDemo])
}
