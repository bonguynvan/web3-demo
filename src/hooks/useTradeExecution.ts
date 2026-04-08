/**
 * useTradeExecution — open/close positions via Router contract.
 *
 * Handles the full flow:
 *   1. Check USDC allowance (exposed via needsApproval)
 *   2. Approve USDC if needed (one-time MAX_UINT256 approval)
 *   3. Simulate the call to catch reverts before paying gas
 *   4. Submit Router.increasePosition or Router.decreasePosition
 *   5. Wait for transaction confirmation
 *
 * State machine: idle → approving → simulating → submitting → confirming → success | error
 *
 * Re-entry guard: if status is not 'idle' or 'error', further calls are ignored.
 */

import { useState, useCallback, useMemo } from 'react'
import { useAccount, useChainId, useReadContract, useWriteContract, useConfig } from 'wagmi'
import { simulateContract } from '@wagmi/core'
import { type Address, maxUint256, BaseError, ContractFunctionRevertedError } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { getContracts } from '../lib/contracts'
import { dollarsToUsdc, PRICE_PRECISION } from '../lib/precision'
import { waitForTxReceipt } from '../lib/waitForReceipt'
import { invalidateContractReads } from '../lib/queryInvalidation'
import { friendlyContractError } from '../lib/contractErrors'

export type TradeStatus =
  | 'idle'
  | 'approving'
  | 'simulating'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'error'

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

/**
 * Distinguish a real on-chain revert from a simulation infrastructure failure
 * (RPC down, timeout, etc.). Real reverts should abort the trade with a friendly
 * message; infrastructure failures should fall through and let the user submit
 * the tx anyway — the chain is the ultimate source of truth.
 */
function isContractRevert(err: unknown): boolean {
  if (err instanceof BaseError) {
    return err.walk(e => e instanceof ContractFunctionRevertedError) !== null
  }
  return false
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

  /** True if the next trade with this collateral amount needs an approve() first. */
  const needsApproval = useCallback(
    (collateralUsd: number): boolean => {
      const required = dollarsToUsdc(collateralUsd)
      return currentAllowance < required
    },
    [currentAllowance]
  )

  const isBusy = status !== 'idle' && status !== 'error' && status !== 'success'

  const approve = useCallback(async () => {
    if (!contracts) throw new Error('Contracts not configured')
    setStatus('approving')
    const hash = await writeContractAsync({
      ...contracts.usdc,
      functionName: 'approve',
      args: [contracts.addresses.router, maxUint256],
    })
    await waitForTxReceipt(config, hash)
    invalidateContractReads(queryClient)
  }, [contracts, writeContractAsync, config, queryClient])

  const failWithFriendly = useCallback((err: unknown) => {
    const friendly = friendlyContractError(err)
    setError(friendly.detail ? `${friendly.title}: ${friendly.detail}` : friendly.title)
    setStatus('error')
    setTimeout(() => setStatus('idle'), 5000)
  }, [])

  const increasePosition = useCallback(async (params: IncreaseParams) => {
    if (!contracts || !address) throw new Error('Not connected')
    if (isBusy) return // re-entry guard

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

      // Pre-flight simulation — catches reverts without burning gas.
      // Only abort on a real ContractFunctionRevertedError; let infra errors
      // fall through to the actual submit.
      setStatus('simulating')
      try {
        await simulateContract(config, {
          ...contracts.router,
          functionName: 'increasePosition',
          args: [params.indexToken, collateralUsdc, sizeDelta, params.isLong, acceptablePrice],
          account: address,
        })
      } catch (simErr) {
        if (isContractRevert(simErr)) {
          failWithFriendly(simErr)
          return
        }
        // Non-revert simulation failure (RPC, timeout) — log and continue.
        // The actual write may still succeed.
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
      invalidateContractReads(queryClient)
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      failWithFriendly(err)
    }
  }, [
    contracts, address, isBusy, currentAllowance, approve,
    writeContractAsync, config, queryClient, failWithFriendly,
  ])

  const decreasePosition = useCallback(async (params: DecreaseParams) => {
    if (!contracts || !address) throw new Error('Not connected')
    if (isBusy) return // re-entry guard

    setError(null)

    const slippageBps = BigInt(params.slippageBps ?? 30)
    const slippageAmount = (params.currentPriceRaw * slippageBps) / 10_000n
    const acceptablePrice = params.isLong
      ? params.currentPriceRaw - slippageAmount
      : params.currentPriceRaw + slippageAmount

    try {
      // Pre-flight simulation
      setStatus('simulating')
      try {
        await simulateContract(config, {
          ...contracts.router,
          functionName: 'decreasePosition',
          args: [
            params.indexToken,
            params.collateralDelta,
            params.sizeDelta,
            params.isLong,
            acceptablePrice,
            params.receiver,
          ],
          account: address,
        })
      } catch (simErr) {
        if (isContractRevert(simErr)) {
          failWithFriendly(simErr)
          return
        }
      }

      setStatus('submitting')
      const hash = await writeContractAsync({
        ...contracts.router,
        functionName: 'decreasePosition',
        args: [
          params.indexToken,
          params.collateralDelta,
          params.sizeDelta,
          params.isLong,
          acceptablePrice,
          params.receiver,
        ],
      })

      setStatus('confirming')
      await waitForTxReceipt(config, hash)

      setStatus('success')
      invalidateContractReads(queryClient)
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      failWithFriendly(err)
    }
  }, [
    contracts, address, isBusy, writeContractAsync,
    config, queryClient, failWithFriendly,
  ])

  return {
    status,
    error,
    needsApproval,
    increasePosition,
    decreasePosition,
  }
}
