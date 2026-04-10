/**
 * useTokenList — React Query wrapper for the Arbitrum token list.
 *
 * Fetches once, caches for the session, provides client-side search.
 */

import { useQuery } from '@tanstack/react-query'
import { fetchTokenList, searchTokens } from '../lib/tokenList'
import { ARBITRUM_CHAIN_ID } from '../lib/spotConstants'
import { useCallback } from 'react'
import type { Token } from '../types/spot'

export function useTokenList() {
  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['tokenList', ARBITRUM_CHAIN_ID],
    queryFn: fetchTokenList,
    staleTime: 30 * 60 * 1000,  // 30 minutes
    gcTime: Infinity,            // keep for entire session
  })

  const search = useCallback(
    (query: string): Token[] => searchTokens(query, tokens),
    [tokens],
  )

  return { tokens, isLoading, search }
}
