/**
 * usePrices — oracle prices.
 *
 * Demo mode: simulated prices that tick every 500ms.
 * Live mode: reads PriceFeed contract every 3 seconds.
 *
 * Both paths always execute (Rules of Hooks), but only the active one's data is returned.
 */

import { useState, useEffect, useCallback } from 'react'
import { useChainId, useReadContracts } from 'wagmi'
import { getContracts, getMarkets } from '../lib/contracts'
import { priceToNumber } from '../lib/precision'
import { useIsDemo } from '../store/modeStore'
import { tickDemoPrices, getDemoPrices } from '../lib/demoData'

export interface TokenPrice {
  symbol: string
  market: string
  raw: bigint
  price: number
}

export function usePrices() {
  const isDemo = useIsDemo()
  const chainId = useChainId()

  // ─── Demo path (always runs) ───
  const [demoPrices, setDemoPrices] = useState<TokenPrice[]>(() =>
    getDemoPrices().map(d => ({ symbol: d.symbol, market: d.market, raw: d.raw, price: d.price }))
  )

  useEffect(() => {
    if (!isDemo) return
    const id = setInterval(() => {
      setDemoPrices(tickDemoPrices().map(d => ({
        symbol: d.symbol, market: d.market, raw: d.raw, price: d.price,
      })))
    }, 500)
    return () => clearInterval(id)
  }, [isDemo])

  // ─── Live path (always runs, but disabled when demo) ───
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
