/**
 * useOrderbook — Custom hook for WebSocket-driven orderbook with 100ms throttle.
 *
 * ARCHITECTURE:
 * =============
 *
 *   WebSocket                  Zustand Store              React Component
 *   ─────────                  ────────────               ───────────────
 *   msg @ 1ms   ──┐
 *   msg @ 2ms   ──┤
 *   msg @ 3ms   ──┤  ← buffer
 *   ...          ──┤       │
 *   msg @ 99ms  ──┤       │ flush every 100ms
 *   msg @ 100ms ──┘       ▼
 *                    orderbookStore.setState()  ──→  re-render (10x/sec max)
 *
 * WHY THROTTLE AT 100ms (not rAF at 16ms)?
 * =========================================
 * The orderbook is a dense table of numbers. Even at 60fps, the human eye
 * can't track individual price level changes faster than ~10 updates/sec.
 * Throttling to 100ms means:
 *   - At most 10 renders/sec for the orderbook
 *   - The LATEST data is always shown (no stale data)
 *   - 90% fewer renders compared to rAF
 *   - Huge win on mobile browsers
 *
 * DATA STRUCTURE:
 * ===============
 * The orderbook is stored as a Map<price, size> internally for O(1) updates.
 * When rendering, we convert to a sorted array. This is faster than maintaining
 * a sorted array during high-frequency updates.
 *
 * WS MESSAGE TYPES:
 * =================
 * 1. "snapshot" — full orderbook replacement (on initial connect)
 * 2. "delta"    — incremental update (size=0 means remove the level)
 */

import { useEffect, useRef, useState } from 'react'
import { useTradingStore } from '../store/tradingStore'
import type { OrderBookData, OrderBookEntry } from '../types/trading'

interface RawOrderBookLevel {
  price: string   // string to avoid float precision loss
  size: string
}

interface OrderBookMessage {
  type: 'snapshot' | 'delta'
  asks: RawOrderBookLevel[]
  bids: RawOrderBookLevel[]
  seq: number
}

interface UseOrderbookOptions {
  /** WebSocket URL. If null, uses the mock simulation from tradingStore */
  wsUrl: string | null
  /** Throttle interval in ms. Default: 100ms */
  throttleMs?: number
  /** Market symbol to subscribe to */
  market: string
}

export function useOrderbook({
  wsUrl,
  throttleMs = 100,
  market,
}: UseOrderbookOptions) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected')

  // Internal state: Map for O(1) price-level updates
  const asksMap = useRef(new Map<number, number>())
  const bidsMap = useRef(new Map<number, number>())
  const lastSeq = useRef(0)
  const wsRef = useRef<WebSocket | null>(null)
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const dirty = useRef(false)

  /**
   * Convert the internal Map to the sorted array format the UI needs.
   * This runs at most every 100ms, not on every WS message.
   */
  const flushToStore = () => {
    if (!dirty.current) return
    dirty.current = false

    // Sort asks ascending (lowest ask first)
    const asks: OrderBookEntry[] = Array.from(asksMap.current.entries())
      .sort(([a], [b]) => a - b)
      .map(([price, size]) => ({ price, size, total: 0 }))

    // Sort bids descending (highest bid first)
    const bids: OrderBookEntry[] = Array.from(bidsMap.current.entries())
      .sort(([a], [b]) => b - a)
      .map(([price, size]) => ({ price, size, total: 0 }))

    // Compute cumulative totals
    let askTotal = 0
    for (const entry of asks) {
      askTotal += entry.size
      entry.total = +askTotal.toFixed(3)
    }

    let bidTotal = 0
    for (const entry of bids) {
      bidTotal += entry.size
      entry.total = +bidTotal.toFixed(3)
    }

    // Compute spread
    const bestAsk = asks[0]?.price ?? 0
    const bestBid = bids[0]?.price ?? 0
    const spread = +(bestAsk - bestBid).toFixed(2)
    const mid = (bestAsk + bestBid) / 2
    const spreadPercent = mid > 0 ? +((spread / mid) * 100).toFixed(4) : 0

    const data: OrderBookData = { asks, bids, spread, spreadPercent }

    // Direct store update (not through Zustand action, for perf)
    useTradingStore.setState({ orderBook: data })
  }

  /**
   * Apply a WS message to the internal Maps.
   * This is called on EVERY WS message (could be 1000/sec),
   * but it's just Map.set() — no React rendering here.
   */
  const applyMessage = (msg: OrderBookMessage) => {
    // Sequence check — drop stale messages
    if (msg.seq <= lastSeq.current && msg.type !== 'snapshot') return
    lastSeq.current = msg.seq

    if (msg.type === 'snapshot') {
      // Full replacement
      asksMap.current.clear()
      bidsMap.current.clear()
    }

    // Apply ask updates
    for (const level of msg.asks) {
      const price = parseFloat(level.price)
      const size = parseFloat(level.size)
      if (size === 0) {
        asksMap.current.delete(price)  // size=0 means remove this level
      } else {
        asksMap.current.set(price, size)
      }
    }

    // Apply bid updates
    for (const level of msg.bids) {
      const price = parseFloat(level.price)
      const size = parseFloat(level.size)
      if (size === 0) {
        bidsMap.current.delete(price)
      } else {
        bidsMap.current.set(price, size)
      }
    }

    dirty.current = true
  }

  useEffect(() => {
    // Start the throttled flush timer
    flushTimer.current = setInterval(flushToStore, throttleMs)

    if (!wsUrl) {
      // No WS URL — use the mock simulation (tradingStore.tickPrice handles it)
      setConnectionStatus('connected')
      return () => {
        if (flushTimer.current) clearInterval(flushTimer.current)
      }
    }

    // Connect to real WebSocket
    setConnectionStatus('connecting')

    const connect = () => {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnectionStatus('connected')
        // Subscribe to this market's orderbook channel
        ws.send(JSON.stringify({
          type: 'subscribe',
          channel: 'orderbook',
          market,
        }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as OrderBookMessage
          if (msg.type === 'snapshot' || msg.type === 'delta') {
            applyMessage(msg)
          }
        } catch {
          // malformed message
        }
      }

      ws.onclose = () => {
        setConnectionStatus('disconnected')
        // Auto-reconnect after 2 seconds
        setTimeout(connect, 2000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null  // prevent reconnect on intentional close
        wsRef.current.close()
      }
    }
  }, [wsUrl, market, throttleMs]) // eslint-disable-line react-hooks/exhaustive-deps

  return { connectionStatus }
}
