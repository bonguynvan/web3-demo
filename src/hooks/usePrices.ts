/**
 * usePrices — price data for the entire app.
 *
 * Demo mode: subscribes to Binance WebSocket ticker stream (push, no polling).
 *            Falls back to simulation if WebSocket can't connect.
 * Live mode: reads PriceFeed contract every 3 seconds.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useChainId, useReadContracts } from 'wagmi'
import { getContracts, getMarkets } from '../lib/contracts'
import { priceToNumber } from '../lib/precision'
import { useIsDemo } from '../store/modeStore'
import { tickDemoPrices, getDemoPrices } from '../lib/demoData'
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
  const isDemo = useIsDemo()
  const venueId = useActiveVenue()
  const chainId = useChainId()

  // ─── Demo path: Binance WebSocket with simulation fallback ───
  const [demoPrices, setDemoPrices] = useState<TokenPrice[]>(() =>
    getDemoPrices().map(d => ({ symbol: d.symbol, market: d.market, raw: d.raw, price: d.price }))
  )
  const wsActiveRef = useRef(false)

  useEffect(() => {
    if (!isDemo) return

    // Subscribe to every market the active venue exposes. Adapter API is
    // per-market, so we maintain a local map and rebuild the array on each
    // tick. rAF coalesces bursts of updates into one React state set.
    const adapter = getActiveAdapter()
    const tickerMap = new Map<string, Ticker>()
    const unsubs: Unsubscribe[] = []
    let rafId = 0

    const flush = () => {
      rafId = 0
      const next: TokenPrice[] = []
      for (const t of tickerMap.values()) {
        next.push(tickerToTokenPrice(t))
      }
      if (next.length > 0) {
        wsActiveRef.current = true
        setDemoPrices(next)
      }
    }
    const schedule = () => {
      if (rafId) return
      rafId = requestAnimationFrame(flush)
    }

    let cancelled = false
    void adapter.connect().then(() => adapter.listMarkets()).then((markets) => {
      if (cancelled) return
      for (const m of markets) {
        const u = adapter.subscribeTicker(m.id, (t) => {
          tickerMap.set(t.marketId, t)
          schedule()
        })
        unsubs.push(u)
      }
    })

    // Fallback simulation — runs while the venue stream hasn't delivered.
    const fallbackId = setInterval(() => {
      if (wsActiveRef.current) {
        tickDemoPrices()
        return
      }
      setDemoPrices(tickDemoPrices().map(d => ({
        symbol: d.symbol, market: d.market, raw: d.raw, price: d.price,
      })))
    }, 500)

    return () => {
      cancelled = true
      for (const u of unsubs) u()
      if (rafId) cancelAnimationFrame(rafId)
      clearInterval(fallbackId)
      wsActiveRef.current = false
    }
  }, [isDemo, venueId])

  // ─── Live path (always runs, disabled when demo) ───
  let contracts: ReturnType<typeof getContracts> | null = null
  let markets: { symbol: string; baseAsset: string; indexToken: `0x${string}` }[] = []
  try {
    contracts = getContracts(chainId)
    markets = getMarkets(contracts.addresses)
  } catch {}

  const { data: liveData } = useReadContracts({
    contracts: contracts ? markets.map(m => ({
      ...contracts!.priceFeed,
      functionName: 'getLatestPrice' as const,
      args: [m.indexToken] as const,
    })) : [],
    query: {
      enabled: !isDemo && !!contracts && markets.length > 0,
      refetchInterval: 3_000,
    },
  })

  const livePrices: TokenPrice[] = markets.map((m, i) => {
    const result = liveData?.[i]
    const raw = result?.status === 'success' ? (result.result as bigint) : 0n
    return { symbol: m.baseAsset, market: m.symbol, raw, price: raw > 0n ? priceToNumber(raw) : 0 }
  })

  // ─── Return active mode's data ───
  const prices = isDemo ? demoPrices : livePrices

  const getPrice = useCallback(
    (marketSymbol: string): TokenPrice | undefined => prices.find(p => p.market === marketSymbol),
    [prices]
  )

  return { prices, getPrice, isLoading: false }
}
