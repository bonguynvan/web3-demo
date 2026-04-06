/**
 * useVault — read vault statistics (pool amount, reserves, AUM).
 */

import { useChainId, useReadContracts } from 'wagmi'
import { getContracts } from '../lib/contracts'
import { usdcToDollars } from '../lib/precision'

export interface VaultStats {
  poolAmount: number
  reservedAmount: number
  availableLiquidity: number
  aum: number
  utilizationPercent: number
}

export function useVault() {
  const chainId = useChainId()

  let contracts: ReturnType<typeof getContracts> | null = null
  try {
    contracts = getContracts(chainId)
  } catch {
    // Chain not configured
  }

  const { data, ...query } = useReadContracts({
    contracts: [
      { ...contracts!.vault, functionName: 'getPoolAmount' as const },
      { ...contracts!.vault, functionName: 'getReservedAmount' as const },
      { ...contracts!.vault, functionName: 'getAvailableLiquidity' as const },
      { ...contracts!.vault, functionName: 'getAum' as const },
    ],
    query: {
      enabled: !!contracts,
      refetchInterval: 10_000,
    },
  })

  const poolAmount = data?.[0]?.status === 'success' ? (data[0].result as bigint) : 0n
  const reservedAmount = data?.[1]?.status === 'success' ? (data[1].result as bigint) : 0n
  const availableLiquidity = data?.[2]?.status === 'success' ? (data[2].result as bigint) : 0n
  const aum = data?.[3]?.status === 'success' ? (data[3].result as bigint) : 0n

  const stats: VaultStats = {
    poolAmount: usdcToDollars(poolAmount),
    reservedAmount: usdcToDollars(reservedAmount),
    availableLiquidity: usdcToDollars(availableLiquidity),
    aum: usdcToDollars(aum),
    utilizationPercent: poolAmount > 0n
      ? Number((reservedAmount * 10000n) / poolAmount) / 100
      : 0,
  }

  return {
    stats,
    raw: { poolAmount, reservedAmount, availableLiquidity, aum },
    ...query,
  }
}
