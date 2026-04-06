/**
 * useTokenBalance — read ERC20 balance for connected wallet.
 *
 * Polls every 5 seconds for fresh balance.
 * Returns both raw bigint (6-dec USDC) and display number.
 */

import { useAccount, useChainId, useReadContract } from 'wagmi'
import { getContracts } from '../lib/contracts'
import { usdcToDollars } from '../lib/precision'

export function useUsdcBalance() {
  const { address } = useAccount()
  const chainId = useChainId()

  let contracts: ReturnType<typeof getContracts> | null = null
  try {
    contracts = getContracts(chainId)
  } catch {
    // Chain not configured
  }

  const { data: rawBalance, ...query } = useReadContract({
    ...contracts?.usdc,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!contracts,
      refetchInterval: 5_000,
    },
  })

  const balance = rawBalance as bigint | undefined

  return {
    /** Raw USDC balance (6 decimals) */
    raw: balance ?? 0n,
    /** Display balance as number (e.g., 12456.78) */
    dollars: balance ? usdcToDollars(balance) : 0,
    ...query,
  }
}

export function usePlpBalance() {
  const { address } = useAccount()
  const chainId = useChainId()

  let contracts: ReturnType<typeof getContracts> | null = null
  try {
    contracts = getContracts(chainId)
  } catch {
    // Chain not configured
  }

  const { data: rawBalance, ...query } = useReadContract({
    ...contracts?.plp,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!contracts,
      refetchInterval: 5_000,
    },
  })

  const balance = rawBalance as bigint | undefined

  return {
    raw: balance ?? 0n,
    /** PLP also uses 6 decimals (mirrors USDC on first deposit) */
    display: balance ? Number(balance) / 1e6 : 0,
    ...query,
  }
}
