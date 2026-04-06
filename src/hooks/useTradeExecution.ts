/**
 * useTradeExecution — open/close positions via Router contract.
 *
 * Handles the full flow:
 *   1. Check USDC allowance
 *   2. Approve USDC if needed (one-time MAX_UINT256 approval)
 *   3. Call Router.increasePosition or Router.decreasePosition
 *   4. Wait for transaction confirmation
 *
 * State machine: idle → approving → submitting → confirming → success | error
 */

import { useState, useCallback, useMemo } from 'react'
import { useAccount, useChainId, useReadContract, useWriteContract, useConfig } from 'wagmi'
import { type Address, maxUint256 } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { getContracts } from '../lib/contracts'
import { dollarsToUsdc, PRICE_PRECISION } from '../lib/precision'
import { waitForTxReceipt } from '../lib/waitForReceipt'

export type TradeStatus = 'idle' | 'approving' | 'submitting' | 'confirming' | 'success' | 'error'

interface IncreaseParams {
  indexToken: Address
  collateralUsd: number
  sizeUsd: number
  isLong: boolean
  currentPriceRaw: bigint
  slippageBps?: number
}

interface DecreaseParams {
  indexToken: Address
  collateralDelta: bigint
  sizeDelta: bigint
  isLong: boolean
  currentPriceRaw: bigint
  receiver: Address
  slippageBps?: number
}

export function useTradeExecution() {
  const { address } = useAccount()
  const chainId = useChainId()
  const config = useConfig()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<TradeStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const contracts = useMemo(() => {
    try {
      return getContracts(chainId)
    } catch {
      return null
    }
  }, [chainId])

  const { data: allowance } = useReadContract({
    ...contracts?.usdc,
    functionName: 'allowance',
    args: address && contracts ? [address, contracts.addresses.router] : undefined,
    query: {
      enabled: !!address && !!contracts,
    },
  })

  const { writeContractAsync } = useWriteContract()

  const currentAllowance = (allowance as bigint) ?? 0n

  const approve = useCallback(async () => {
    if (!contracts) throw new Error('Contracts not configured')
    setStatus('approving')
    const hash = await writeContractAsync({
      ...contracts.usdc,
      functionName: 'approve',
      args: [contracts.addresses.router, maxUint256],
    })
    await waitForTxReceipt(config, hash)
    queryClient.invalidateQueries({ queryKey: ['readContract'] })
  }, [contracts, writeContractAsync, config, queryClient])

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['readContract'] })
    queryClient.invalidateQueries({ queryKey: ['readContracts'] })
  }, [queryClient])

  const increasePosition = useCallback(async (params: IncreaseParams) => {
    if (!contracts || !address) throw new Error('Not connected')

    setError(null)
    const collateralUsdc = dollarsToUsdc(params.collateralUsd)
    const sizeDelta = BigInt(Math.round(params.sizeUsd)) * PRICE_PRECISION

    const slippageBps = BigInt(params.slippageBps ?? 30)
    const slippageAmount = (params.currentPriceRaw * slippageBps) / 10_000n
    const acceptablePrice = params.isLong
      ? params.currentPriceRaw + slippageAmount
      : params.currentPriceRaw - slippageAmount

    try {
      if (currentAllowance < collateralUsdc) {
        await approve()
      }

      setStatus('submitting')
      const hash = await writeContractAsync({
        ...contracts.router,
        functionName: 'increasePosition',
        args: [params.indexToken, collateralUsdc, sizeDelta, params.isLong, acceptablePrice],
      })

      setStatus('confirming')
      await waitForTxReceipt(config, hash)

      setStatus('success')
      invalidateAll()
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message.slice(0, 200))
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [contracts, address, currentAllowance, approve, writeContractAsync, config, invalidateAll])

  const decreasePosition = useCallback(async (params: DecreaseParams) => {
    if (!contracts || !address) throw new Error('Not connected')

    setError(null)

    const slippageBps = BigInt(params.slippageBps ?? 30)
    const slippageAmount = (params.currentPriceRaw * slippageBps) / 10_000n
    const acceptablePrice = params.isLong
      ? params.currentPriceRaw - slippageAmount
      : params.currentPriceRaw + slippageAmount

    try {
      setStatus('submitting')
      const hash = await writeContractAsync({
        ...contracts.router,
        functionName: 'decreasePosition',
        args: [params.indexToken, params.collateralDelta, params.sizeDelta, params.isLong, acceptablePrice, params.receiver],
      })

      setStatus('confirming')
      await waitForTxReceipt(config, hash)

      setStatus('success')
      invalidateAll()
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message.slice(0, 200))
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [contracts, address, writeContractAsync, config, invalidateAll])

  return {
    status,
    error,
    increasePosition,
    decreasePosition,
  }
}
