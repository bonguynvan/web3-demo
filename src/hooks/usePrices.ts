/**
 * usePrices — price data for the entire app (header, depth, order form, positions).
 *
 * Demo mode: fetches real prices from Binance public API every 2s.
 *            Falls back to simulated prices if Binance is unreachable.
 * Live mode: reads PriceFeed contract every 3 seconds.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useChainId, useReadContracts } from 'wagmi'
import { getContracts, getMarkets } from '../lib/contracts'
import { priceToNumber } from '../lib/precision'
import { useIsDemo } from '../store/modeStore'
import { tickDemoPrices, getDemoPrices } from '../lib/demoData'
import { fetchBinancePrices } from '../lib/binancePrices'

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

export function usePrices() {
  const isDemo = useIsDemo()
  const chainId = useChainId()

  // ─── Demo path: try Binance, fall back to simulation ───
  const [demoPrices, setDemoPrices] = useState<TokenPrice[]>(() =>
    getDemoPrices().map(d => ({ symbol: d.symbol, market: d.market, raw: d.raw, price: d.price }))
  )
  const binanceOkRef = useRef(false)

  useEffect(() => {
    if (!isDemo) return
    let active = true

    // Poll Binance every 2s
    const poll = async () => {
      if (!active) return
      try {
        const bp = await fetchBinancePrices()
        if (bp.length > 0 && active) {
          binanceOkRef.current = true
          setDemoPrices(bp.map(p => ({
            symbol: p.symbol, market: p.market,
            raw: priceToRaw(p.price), price: p.price,
          })))
        }
      } catch {
        binanceOkRef.current = false
      }
    }
    poll()
    const binanceId = setInterval(poll, 2000)

    // Simulation fallback — only updates state if Binance is down
    const simId = setInterval(() => {
      if (!active || binanceOkRef.current) {
        tickDemoPrices() // keep demoData in sync even when not displayed
        return
      }
      setDemoPrices(tickDemoPrices().map(d => ({
        symbol: d.symbol, market: d.market, raw: d.raw, price: d.price,
      })))
    }, 500)

    return () => { active = false; clearInterval(binanceId); clearInterval(simId) }
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
