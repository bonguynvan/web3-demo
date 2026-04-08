/**
 * useVaultOperations — LP deposit/withdraw via Router.
 *
 * Deposit: USDC approve → Router.depositToVault → receive PLP
 * Withdraw: PLP approve → Router.withdrawFromVault → receive USDC
 */

import { useState, useCallback, useMemo } from 'react'
import { useAccount, useChainId, useConfig, useWriteContract } from 'wagmi'
import { maxUint256 } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { getContracts } from '../lib/contracts'
import { dollarsToUsdc } from '../lib/precision'
import { waitForTxReceipt } from '../lib/waitForReceipt'
import { invalidateContractReads } from '../lib/queryInvalidation'

export type VaultOpStatus = 'idle' | 'approving' | 'submitting' | 'confirming' | 'success' | 'error'

export function useVaultOperations() {
  const { address } = useAccount()
  const chainId = useChainId()
  const config = useConfig()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<VaultOpStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const contracts = useMemo(() => {
    try {
      return getContracts(chainId)
    } catch {
      return null
    }
  }, [chainId])

  const { writeContractAsync } = useWriteContract()

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
      await waitForTxReceipt(config, approveTx)

      // Deposit
      setStatus('submitting')
      const depositTx = await writeContractAsync({
        ...contracts.router,
        functionName: 'depositToVault',
        args: [amount],
      })

      setStatus('confirming')
      await waitForTxReceipt(config, depositTx)

      setStatus('success')
      invalidateContractReads(queryClient)
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.slice(0, 200) : String(err))
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [contracts, address, writeContractAsync, config, queryClient])

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
      await waitForTxReceipt(config, approveTx)

      // Withdraw
      setStatus('submitting')
      const withdrawTx = await writeContractAsync({
        ...contracts.router,
        functionName: 'withdrawFromVault',
        args: [plpAmount],
      })

      setStatus('confirming')
      await waitForTxReceipt(config, withdrawTx)

      setStatus('success')
      invalidateContractReads(queryClient)
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.slice(0, 200) : String(err))
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [contracts, address, writeContractAsync, config, queryClient])

  return { status, error, deposit, withdraw }
}
