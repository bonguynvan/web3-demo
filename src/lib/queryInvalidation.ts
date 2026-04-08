/**
 * Cache invalidation helper for wagmi/tanstack query.
 *
 * After any successful on-chain write, call invalidateContractReads(queryClient)
 * to refresh balances, allowances, positions, and vault stats consistently.
 *
 * Centralised so multiple write hooks (useTradeExecution, useVaultOperations, ...)
 * cannot drift in what they invalidate.
 */

import type { QueryClient } from '@tanstack/react-query'

/**
 * Invalidate every wagmi-managed contract read query.
 *
 * Wagmi v2 stores read queries under both `['readContract']` (single) and
 * `['readContracts']` (batched). Invalidating both keys covers every hook
 * the app uses today.
 */
export function invalidateContractReads(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['readContract'] })
  queryClient.invalidateQueries({ queryKey: ['readContracts'] })
}
