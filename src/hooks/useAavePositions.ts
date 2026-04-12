/**
 * useAavePositions — React Query hook for Aave V3 account data.
 *
 * Fetches user's total collateral, debt, health factor, and available borrows.
 * Only enabled when wallet is connected to Arbitrum.
 */

import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import { aaveClient } from '../lib/aaveClient'
import { ARBITRUM_CHAIN_ID } from '../lib/spotConstants'

export function useAavePositions() {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: ARBITRUM_CHAIN_ID })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['aavePositions', address],
    queryFn: async () => {
      if (!publicClient || !address) throw new Error('Not connected')
      const result = await aaveClient.getUserAccountData(publicClient, address)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!address && !!publicClient,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  return {
    summary: data ?? null,
    isLoading: !!address && isLoading,
    error: error?.message ?? null,
    refetch,
  }
}
