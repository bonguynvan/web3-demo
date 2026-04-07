/**
 * usePrices — oracle prices.
 *
 * Demo mode: simulated prices that tick every 500ms.
 * Live mode: reads PriceFeed contract every 3 seconds.
 */

import { useState, useEffect, useCallback } from 'react'
import { useChainId, useReadContracts } from 'wagmi'
import { getContracts, getMarkets, type MarketConfig } from '../lib/contracts'
import { priceToNumber } from '../lib/precision'
import { useIsDemo } from '../store/modeStore'
import { tickDemoPrices, getDemoPrices, type DemoPrice } from '../lib/demoData'

export interface TokenPrice {
  symbol: string
  market: string
  raw: bigint
  price: number
}

export function usePrices() {
  const isDemo = useIsDemo()

  if (isDemo) {
    return useDemoPrices()
  }
  return useLivePrices()
}

// ─── Demo prices ───

function useDemoPrices() {
  const [prices, setPrices] = useState<TokenPrice[]>(() =>
    getDemoPrices().map(toTokenPrice)
  )

  useEffect(() => {
    const id = setInterval(() => {
      setPrices(tickDemoPrices().map(toTokenPrice))
    }, 500)
    return () => clearInterval(id)
  }, [])

  const getPrice = useCallback((market: string) =>
    prices.find(p => p.market === market)
  , [prices])

  return { prices, getPrice, isLoading: false, isError: false }
}

function toTokenPrice(d: DemoPrice): TokenPrice {
  return { symbol: d.symbol, market: d.market, raw: d.raw, price: d.price }
}

// ─── Live prices ───

function useLivePrices() {
  const chainId = useChainId()

  let contracts: ReturnType<typeof getContracts> | null = null
  let markets: MarketConfig[] = []
  try {
    contracts = getContracts(chainId)
    markets = getMarkets(contracts.addresses)
  } catch {}

  const { data, ...query } = useReadContracts({
    contracts: markets.map(m => ({
      ...contracts!.priceFeed,
      functionName: 'getLatestPrice' as const,
      args: [m.indexToken] as const,
    })),
    query: {
      enabled: !!contracts && markets.length > 0,
      refetchInterval: 3_000,
    },
  })

  const prices: TokenPrice[] = markets.map((m, i) => {
    const result = data?.[i]
    const raw = result?.status === 'success' ? (result.result as bigint) : 0n
    return {
      symbol: m.baseAsset,
      market: m.symbol,
      raw,
      price: raw > 0n ? priceToNumber(raw) : 0,
    }
  })

  const getPrice = useCallback((marketSymbol: string): TokenPrice | undefined =>
    prices.find(p => p.market === marketSymbol)
  , [prices])

  return { prices, getPrice, ...query }
}
