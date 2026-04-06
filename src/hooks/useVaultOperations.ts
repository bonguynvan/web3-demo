/**
 * useVaultOperations — LP deposit/withdraw via Router.
 *
 * Deposit: USDC approve → Router.depositToVault → receive PLP
 * Withdraw: PLP approve → Router.withdrawFromVault → receive USDC
 */

import { useState, useCallback } from 'react'
import { useAccount, useChainId, useWriteContract } from 'wagmi'
import { maxUint256 } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { getContracts } from '../lib/contracts'
import { dollarsToUsdc } from '../lib/precision'

export type VaultOpStatus = 'idle' | 'approving' | 'submitting' | 'confirming' | 'success' | 'error'

export function useVaultOperations() {
  const { address } = useAccount()
  const chainId = useChainId()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<VaultOpStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  let contracts: ReturnType<typeof getContracts> | null = null
  try {
    contracts = getContracts(chainId)
  } catch {
    // Chain not configured
  }

  const { writeContractAsync } = useWriteContract()

  const waitForTx = async (hash: `0x${string}`) => {
    await new Promise<void>((resolve, reject) => {
      const check = async () => {
        try {
          const receipt = await fetch('http://127.0.0.1:8545', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
          }).then(r => r.json())
          if (receipt.result) {
            if (receipt.result.status === '0x1') resolve()
            else reject(new Error('Transaction reverted'))
          } else {
            setTimeout(check, 1000)
          }
        } catch (err) { reject(err) }
      }
      check()
    })
  }

  const deposit = useCallback(async (usdcAmount: number) => {
    if (!contracts || !address) return
    setError(null)

    const amount = dollarsToUsdc(usdcAmount)

    try {
      // Approve USDC for Router
      setStatus('approving')
      const approveTx = await writeContractAsync({
        ...contracts.usdc,
        functionName: 'approve',
        args: [contracts.addresses.router, maxUint256],
      })
      await waitForTx(approveTx)

      // Deposit
      setStatus('submitting')
      const depositTx = await writeContractAsync({
        ...contracts.router,
        functionName: 'depositToVault',
        args: [amount],
      })

      setStatus('confirming')
      await waitForTx(depositTx)

      setStatus('success')
      queryClient.invalidateQueries({ queryKey: ['readContract'] })
      queryClient.invalidateQueries({ queryKey: ['readContracts'] })
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.slice(0, 200) : String(err))
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [contracts, address, writeContractAsync, queryClient])

  const withdraw = useCallback(async (plpAmount: bigint) => {
    if (!contracts || !address) return
    setError(null)

    try {
      // Approve PLP for Router
      setStatus('approving')
      const approveTx = await writeContractAsync({
        ...contracts.plp,
        functionName: 'approve',
        args: [contracts.addresses.router, maxUint256],
      })
      await waitForTx(approveTx)

      // Withdraw
      setStatus('submitting')
      const withdrawTx = await writeContractAsync({
        ...contracts.router,
        functionName: 'withdrawFromVault',
        args: [plpAmount],
      })

      setStatus('confirming')
      await waitForTx(withdrawTx)

      setStatus('success')
      queryClient.invalidateQueries({ queryKey: ['readContract'] })
      queryClient.invalidateQueries({ queryKey: ['readContracts'] })
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.slice(0, 200) : String(err))
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [contracts, address, writeContractAsync, queryClient])

  return { status, error, deposit, withdraw }
}
