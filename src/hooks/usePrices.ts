/**
 * usePrices — read oracle prices from PriceFeed contract.
 *
 * Polls every 3 seconds (matching keeper price updater interval).
 * Returns prices in both internal 30-dec and display number formats.
 */

import { useChainId, useReadContracts } from 'wagmi'
import { getContracts, getMarkets, type MarketConfig } from '../lib/contracts'
import { priceToNumber } from '../lib/precision'

export interface TokenPrice {
  /** Token symbol (e.g., "ETH") */
  symbol: string
  /** Market symbol (e.g., "ETH-PERP") */
  market: string
  /** Price in 30-dec internal format */
  raw: bigint
  /** Price as display number */
  price: number
}

export function usePrices() {
  const chainId = useChainId()

  let contracts: ReturnType<typeof getContracts> | null = null
  let markets: MarketConfig[] = []
  try {
    contracts = getContracts(chainId)
    markets = getMarkets(contracts.addresses)
  } catch {
    // Chain not configured
  }

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

  /** Get price for a specific market symbol */
  const getPrice = (marketSymbol: string): TokenPrice | undefined =>
    prices.find(p => p.market === marketSymbol)

  return {
    prices,
    getPrice,
    ...query,
  }
}
