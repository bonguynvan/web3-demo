/**
 * useFaucet — mint test USDC.
 *
 * Demo mode: directly increases the in-memory demo balance.
 * Live mode (Anvil): calls MockERC20.mint() on-chain.
 */

import { useState, useCallback } from 'react'
import { useAccount, useChainId, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { getContracts } from '../lib/contracts'
import { dollarsToUsdc } from '../lib/precision'
import { useIsDemo } from '../store/modeStore'
import { DEMO_ACCOUNT, bumpDemoVersion } from '../lib/demoData'

export function useFaucet() {
  const { address } = useAccount()
  const chainId = useChainId()
  const isDemo = useIsDemo()
  const queryClient = useQueryClient()
  const [minting, setMinting] = useState(false)

  let contracts: ReturnType<typeof getContracts> | null = null
  try { contracts = getContracts(chainId) } catch {}

  const { writeContractAsync } = useWriteContract()

  // Available in demo mode (always) or live mode on Anvil only
  const isAvailable = isDemo || chainId === 31337

  const mint = useCallback(async (usdAmount = 10_000) => {
    if (!isAvailable) return
    setMinting(true)
    try {
      if (isDemo) {
        // Demo mode — just bump the in-memory balance
        await new Promise(r => setTimeout(r, 300)) // small UX delay
        DEMO_ACCOUNT.balance += usdAmount
        bumpDemoVersion()
      } else {
        // Live mode — call on-chain mint
        if (!contracts || !address) return
        const amount = dollarsToUsdc(usdAmount)
        await writeContractAsync({
          ...contracts.usdcMock,
          functionName: 'mint',
          args: [address, amount],
        })
        queryClient.invalidateQueries({ queryKey: ['readContract'] })
      }
    } finally {
      setMinting(false)
    }
  }, [isDemo, isAvailable, contracts, address, writeContractAsync, queryClient])

  return { mint, minting, isAvailable }
}
