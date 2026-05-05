/**
 * usePrices — price data for the entire app.
 *
 * Single venue path: subscribe to every market the active VenueAdapter
 * exposes (Binance / Hyperliquid public WebSocket streams) and surface
 * the merged ticker map as a TokenPrice[] the rest of the app consumes.
 *
 * Pre-pivot this hook had a dual demo/live wire-up reading from an
 * on-chain PriceFeed contract; that path is gone — the only price
 * sources today are the venue WS feeds.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getActiveAdapter } from '../adapters/registry'
import { useActiveVenue } from './useActiveVenue'
import type { Ticker, Unsubscribe } from '../adapters/types'

const PRICE_PRECISION = 10n ** 30n

export interface TokenPrice {
  symbol: string
  market: string
  raw: bigint
  price: number
}

function priceToRaw(price: number): bigint {
  return BigInt(Math.round(price * 1e6)) * (PRICE_PRECISION / 10n ** 6n)
}

function tickerToTokenPrice(t: Ticker): TokenPrice {
  const symbol = t.marketId.split('-')[0]
  return { symbol, market: t.marketId, raw: priceToRaw(t.price), price: t.price }
}

export function usePrices() {
  const venueId = useActiveVenue()
  const [prices, setPrices] = useState<TokenPrice[]>([])

  // rAF coalesces bursts of WS updates into one React state set so a
  // hot streaming venue doesn't pin the renderer.
  const rafIdRef = useRef(0)

  useEffect(() => {
    const adapter = getActiveAdapter()
    const tickerMap = new Map<string, Ticker>()
    const unsubs: Unsubscribe[] = []
    let cancelled = false

    const flush = () => {
      rafIdRef.current = 0
      const next: TokenPrice[] = []
      for (const t of tickerMap.values()) next.push(tickerToTokenPrice(t))
      if (next.length > 0) setPrices(next)
    }
    const schedule = () => {
      if (rafIdRef.current) return
      rafIdRef.current = requestAnimationFrame(flush)
    }

    void adapter.connect()
      .then(() => adapter.listMarkets())
      .then((markets) => {
        if (cancelled) return
        for (const m of markets) {
          const u = adapter.subscribeTicker(m.id, (t) => {
            tickerMap.set(t.marketId, t)
            schedule()
          })
          unsubs.push(u)
        }
      })
      .catch(() => { /* WS failure — surface empty list rather than crash */ })

    return () => {
      cancelled = true
      for (const u of unsubs) u()
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = 0
      }
    }
  }, [venueId])

  const getPrice = useCallback(
    (marketSymbol: string): TokenPrice | undefined => prices.find(p => p.market === marketSymbol),
    [prices],
  )

  return { prices, getPrice, isLoading: false }
}
