import { useRef, useState, useEffect } from 'react'

/**
 * Throttles a rapidly changing value to at most once per animation frame.
 *
 * This is the core optimization pattern for trading UIs:
 * - Zustand state can update 1000x/sec (from WebSocket)
 * - But we only want to re-render at 60fps max
 * - This hook bridges that gap
 *
 * Usage:
 *   const rawOrderBook = useTradingStore(s => s.orderBook)
 *   const orderBook = useThrottledValue(rawOrderBook)
 */
export function useThrottledValue<T>(value: T): T {
  const [throttled, setThrottled] = useState(value)
  const rafId = useRef(0)
  const latestValue = useRef(value)

  latestValue.current = value

  useEffect(() => {
    // Only schedule if we haven't already
    if (rafId.current) return

    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0
      setThrottled(latestValue.current)
    })
  }, [value])

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [])

  return throttled
}

/**
 * Throttle to a specific max frequency (e.g., 10 updates/sec for orderbook).
 * More aggressive than rAF throttle — use for expensive components.
 */
export function useThrottledValueMs<T>(value: T, ms: number): T {
  const [throttled, setThrottled] = useState(value)
  const lastUpdate = useRef(0)
  const timerId = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestValue = useRef(value)

  latestValue.current = value

  useEffect(() => {
    const now = Date.now()
    const elapsed = now - lastUpdate.current

    if (elapsed >= ms) {
      lastUpdate.current = now
      setThrottled(value)
    } else if (!timerId.current) {
      timerId.current = setTimeout(() => {
        lastUpdate.current = Date.now()
        timerId.current = null
        setThrottled(latestValue.current)
      }, ms - elapsed)
    }
  }, [value, ms])

  useEffect(() => {
    return () => {
      if (timerId.current) clearTimeout(timerId.current)
    }
  }, [])

  return throttled
}
