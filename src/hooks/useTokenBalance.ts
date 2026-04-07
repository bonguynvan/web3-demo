/**
 * useTokenBalance — USDC and PLP balances.
 *
 * Demo: returns static demo balance.
 * Live: reads ERC20.balanceOf from chain.
 */

import { useAccount, useChainId, useReadContract } from 'wagmi'
import { getContracts } from '../lib/contracts'
import { usdcToDollars } from '../lib/precision'
import { useIsDemo } from '../store/modeStore'
import { DEMO_ACCOUNT } from '../lib/demoData'

export function useUsdcBalance() {
  const isDemo = useIsDemo()
  const { address } = useAccount()
  const chainId = useChainId()

  let contracts: ReturnType<typeof getContracts> | null = null
  try { contracts = getContracts(chainId) } catch {}

  const { data: rawBalance, ...query } = useReadContract({
    ...contracts?.usdc,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !isDemo && !!address && !!contracts,
      refetchInterval: 5_000,
    },
  })

  if (isDemo) {
    return { raw: 0n, dollars: DEMO_ACCOUNT.balance, isLoading: false }
  }

  const balance = rawBalance as bigint | undefined
  return {
    raw: balance ?? 0n,
    dollars: balance ? usdcToDollars(balance) : 0,
    ...query,
  }
}

export function usePlpBalance() {
  const isDemo = useIsDemo()
  const { address } = useAccount()
  const chainId = useChainId()

  let contracts: ReturnType<typeof getContracts> | null = null
  try { contracts = getContracts(chainId) } catch {}

  const { data: rawBalance, ...query } = useReadContract({
    ...contracts?.plp,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !isDemo && !!address && !!contracts,
      refetchInterval: 5_000,
    },
  })

  if (isDemo) {
    return { raw: 0n, display: DEMO_ACCOUNT.plpBalance, isLoading: false }
  }

  const balance = rawBalance as bigint | undefined
  return {
    raw: balance ?? 0n,
    display: balance ? Number(balance) / 1e6 : 0,
    ...query,
  }
}
