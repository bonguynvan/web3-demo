/**
 * useMarketWs — hook for ticker + trades WebSocket streams.
 *
 * Separate from useOrderbook because:
 * 1. Different throttle rates (ticker: rAF, trades: 100ms, orderbook: 100ms)
 * 2. Different data structures (ticker is one object, trades are a list)
 * 3. Can connect to different WS endpoints in production
 *
 * In production, the architecture often looks like:
 *   - wss://api.dex.com/ws/orderbook/{market}  → useOrderbook
 *   - wss://api.dex.com/ws/ticker/{market}     → useMarketWs (ticker)
 *   - wss://api.dex.com/ws/trades/{market}     → useMarketWs (trades)
 *
 * For this boilerplate, we use the local mock simulation.
 */

import { useEffect } from 'react'
import { useTradingStore } from '../store/tradingStore'

interface UseMarketWsOptions {
  /** If null, uses mock simulation */
  wsUrl: string | null
  market: string
  /** Simulation tick interval (only used when wsUrl is null) */
  simulationIntervalMs?: number
}

export function useMarketWs({
  wsUrl: _wsUrl,
  market: _market,
  simulationIntervalMs = 600,
}: UseMarketWsOptions) {
  const tickPrice = useTradingStore(s => s.tickPrice)

  useEffect(() => {
    // When no WS URL, use the mock simulation
    // In production, replace this with a real WS connection
    // that calls store setters on each message
    const id = setInterval(tickPrice, simulationIntervalMs)
    return () => clearInterval(id)
  }, [tickPrice, simulationIntervalMs])
}
