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
import { binanceTicker, type TickerData } from '../lib/binanceTicker'

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

function tickerToTokenPrice(t: TickerData): TokenPrice {
  return { symbol: t.symbol, market: t.market, raw: priceToRaw(t.price), price: t.price }
}

export function usePrices() {
  const isDemo = useIsDemo()
  const chainId = useChainId()

  // ─── Demo path: Binance WebSocket with simulation fallback ───
  const [demoPrices, setDemoPrices] = useState<TokenPrice[]>(() =>
    getDemoPrices().map(d => ({ symbol: d.symbol, market: d.market, raw: d.raw, price: d.price }))
  )
  const wsActiveRef = useRef(false)

  useEffect(() => {
    if (!isDemo) return

    // Subscribe to the singleton ticker stream
    const unsub = binanceTicker.subscribe((tickers) => {
      const next: TokenPrice[] = []
      for (const t of tickers.values()) {
        next.push(tickerToTokenPrice(t))
      }
      if (next.length > 0) {
        wsActiveRef.current = true
        setDemoPrices(next)
      }
    })

    // Fallback simulation — only updates state when WebSocket isn't delivering
    const fallbackId = setInterval(() => {
      if (wsActiveRef.current) {
        // WebSocket is providing data — keep demoData in sync silently
        tickDemoPrices()
        return
      }
      setDemoPrices(tickDemoPrices().map(d => ({
        symbol: d.symbol, market: d.market, raw: d.raw, price: d.price,
      })))
    }, 500)

    // If no ticker arrives within 3 seconds, mark as inactive (use sim)
    const timeoutId = setTimeout(() => {
      if (!wsActiveRef.current) {
        // WebSocket failed or hasn't delivered — fall back to simulation
        wsActiveRef.current = false
      }
    }, 3000)

    return () => {
      unsub()
      clearInterval(fallbackId)
      clearTimeout(timeoutId)
      wsActiveRef.current = false
    }
  }, [isDemo])

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
