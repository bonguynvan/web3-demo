/**
 * useFaucet — mint test USDC on Anvil (dev only).
 *
 * The MockERC20 contract deployed on Anvil has a public `mint()` function.
 * This hook lets the developer get test USDC without running scripts.
 */

import { useState, useCallback } from 'react'
import { useAccount, useChainId, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { getContracts } from '../lib/contracts'
import { dollarsToUsdc } from '../lib/precision'

export function useFaucet() {
  const { address } = useAccount()
  const chainId = useChainId()
  const queryClient = useQueryClient()
  const [minting, setMinting] = useState(false)

  let contracts: ReturnType<typeof getContracts> | null = null
  try {
    contracts = getContracts(chainId)
  } catch {
    // Chain not configured
  }

  const { writeContractAsync } = useWriteContract()

  /** Only available on Anvil (chainId 31337) */
  const isAvailable = chainId === 31337

  const mint = useCallback(async (usdAmount = 10_000) => {
    if (!contracts || !address || !isAvailable) return
    setMinting(true)
    try {
      const amount = dollarsToUsdc(usdAmount)
      await writeContractAsync({
        ...contracts.usdcMock,
        functionName: 'mint',
        args: [address, amount],
      })
      // Invalidate balance cache
      queryClient.invalidateQueries({ queryKey: ['readContract'] })
    } finally {
      setMinting(false)
    }
  }, [contracts, address, isAvailable, writeContractAsync, queryClient])

  return { mint, minting, isAvailable }
}
