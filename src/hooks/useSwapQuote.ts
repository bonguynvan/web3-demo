/**
 * useSwapQuote — debounced indicative price from 0x API.
 *
 * Polls for fresh quotes while the user has an amount entered.
 * Debounces input by 500ms to avoid hammering the API.
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useChainId } from 'wagmi'
import { zeroXClient } from '../lib/zeroXClient'
import { parseTokenAmount, isValidAmount } from '../lib/spotUtils'
import { ARBITRUM_CHAIN_ID } from '../lib/spotConstants'
import { useSpotStore } from '../store/spotStore'

/** Debounce hook — delays value updates by `delay` ms. */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useSwapQuote() {
  const { address } = useAccount()
  const chainId = useChainId()
  const { sellToken, buyToken, sellAmount, slippageBps } = useSpotStore()

  const debouncedAmount = useDebounce(sellAmount, 500)

  const enabled =
    !!address &&
    chainId === ARBITRUM_CHAIN_ID &&
    isValidAmount(debouncedAmount) &&
    sellToken.address.toLowerCase() !== buyToken.address.toLowerCase()

  const rawAmount = enabled
    ? parseTokenAmount(debouncedAmount, sellToken.decimals).toString()
    : '0'

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'swapQuote',
      sellToken.address,
      buyToken.address,
      rawAmount,
      address,
    ],
    queryFn: async () => {
      const result = await zeroXClient.getPrice({
        sellToken,
        buyToken,
        sellAmount: rawAmount,
        taker: address!,
        slippageBps,
      })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false, // don't retry on rate limit
  })

  return {
    quote: data ?? null,
    isLoading: enabled && isLoading,
    error: error?.message ?? null,
    refetch,
  }
}
