/**
 * useVault — vault statistics.
 *
 * Demo: returns static demo vault stats.
 * Live: reads Vault contract.
 */

import { useChainId, useReadContracts } from 'wagmi'
import { getContracts } from '../lib/contracts'
import { usdcToDollars } from '../lib/precision'
import { useIsDemo } from '../store/modeStore'
import { getDemoVaultStats } from '../lib/demoData'

export interface VaultStats {
  poolAmount: number
  reservedAmount: number
  availableLiquidity: number
  aum: number
  utilizationPercent: number
}

export function useVault() {
  const isDemo = useIsDemo()
  const chainId = useChainId()

  let contracts: ReturnType<typeof getContracts> | null = null
  try { contracts = getContracts(chainId) } catch {}

  const { data, ...query } = useReadContracts({
    contracts: [
      { ...contracts!.vault, functionName: 'getPoolAmount' as const },
      { ...contracts!.vault, functionName: 'getReservedAmount' as const },
      { ...contracts!.vault, functionName: 'getAvailableLiquidity' as const },
      { ...contracts!.vault, functionName: 'getAum' as const },
    ],
    query: {
      enabled: !isDemo && !!contracts,
      refetchInterval: 10_000,
    },
  })

  if (isDemo) {
    return { stats: getDemoVaultStats(), raw: { poolAmount: 0n, reservedAmount: 0n, availableLiquidity: 0n, aum: 0n } }
  }

  const poolAmount = data?.[0]?.status === 'success' ? (data[0].result as bigint) : 0n
  const reservedAmount = data?.[1]?.status === 'success' ? (data[1].result as bigint) : 0n
  const availableLiquidity = data?.[2]?.status === 'success' ? (data[2].result as bigint) : 0n
  const aum = data?.[3]?.status === 'success' ? (data[3].result as bigint) : 0n

  return {
    stats: {
      poolAmount: usdcToDollars(poolAmount),
      reservedAmount: usdcToDollars(reservedAmount),
      availableLiquidity: usdcToDollars(availableLiquidity),
      aum: usdcToDollars(aum),
      utilizationPercent: poolAmount > 0n ? Number((reservedAmount * 10000n) / poolAmount) / 100 : 0,
    },
    raw: { poolAmount, reservedAmount, availableLiquidity, aum },
    ...query,
  }
}
