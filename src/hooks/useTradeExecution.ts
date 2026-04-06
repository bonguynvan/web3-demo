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

import { useState, useCallback } from 'react'
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { type Address, maxUint256 } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { getContracts } from '../lib/contracts'
import { dollarsToUsdc, PRICE_PRECISION } from '../lib/precision'

export type TradeStatus = 'idle' | 'approving' | 'submitting' | 'confirming' | 'success' | 'error'

interface IncreaseParams {
  indexToken: Address
  /** Collateral in USD (display number, e.g., 1000) */
  collateralUsd: number
  /** Position size in USD (display number, e.g., 10000) */
  sizeUsd: number
  isLong: boolean
  /** Current oracle price in 30-dec */
  currentPriceRaw: bigint
  /** Slippage tolerance in basis points (default 30 = 0.3%) */
  slippageBps?: number
}

interface DecreaseParams {
  indexToken: Address
  /** Collateral to withdraw in 30-dec internal format */
  collateralDelta: bigint
  /** Size to close in 30-dec internal format */
  sizeDelta: bigint
  isLong: boolean
  /** Current oracle price in 30-dec */
  currentPriceRaw: bigint
  receiver: Address
  slippageBps?: number
}

export function useTradeExecution() {
  const { address } = useAccount()
  const chainId = useChainId()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<TradeStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  let contracts: ReturnType<typeof getContracts> | null = null
  try {
    contracts = getContracts(chainId)
  } catch {
    // Chain not configured
  }

  // Check current USDC allowance for Router
  const { data: allowance } = useReadContract({
    ...contracts?.usdc,
    functionName: 'allowance',
    args: address && contracts ? [address, contracts.addresses.router] : undefined,
    query: {
      enabled: !!address && !!contracts,
    },
  })

  const { writeContractAsync } = useWriteContract()

  const needsApproval = (usdcAmount: bigint): boolean => {
    const currentAllowance = (allowance as bigint) ?? 0n
    return currentAllowance < usdcAmount
  }

  const approve = useCallback(async () => {
    if (!contracts) throw new Error('Contracts not configured')
    setStatus('approving')
    const hash = await writeContractAsync({
      ...contracts.usdc,
      functionName: 'approve',
      args: [contracts.addresses.router, maxUint256],
    })
    // Wait for approval confirmation
    await new Promise<void>((resolve, reject) => {
      const check = async () => {
        try {
          // Simple poll for receipt
          const receipt = await fetch(`http://127.0.0.1:8545`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
          }).then(r => r.json())
          if (receipt.result) {
            resolve()
          } else {
            setTimeout(check, 1000)
          }
        } catch (err) {
          reject(err)
        }
      }
      check()
    })
    // Invalidate allowance cache
    queryClient.invalidateQueries({ queryKey: ['readContract'] })
  }, [contracts, writeContractAsync, queryClient])

  const increasePosition = useCallback(async (params: IncreaseParams) => {
    if (!contracts || !address) throw new Error('Not connected')

    setError(null)
    const collateralUsdc = dollarsToUsdc(params.collateralUsd)
    const sizeDelta = BigInt(Math.round(params.sizeUsd)) * PRICE_PRECISION

    // Calculate acceptable price with slippage
    const slippageBps = BigInt(params.slippageBps ?? 30)
    const slippageAmount = (params.currentPriceRaw * slippageBps) / 10_000n
    const acceptablePrice = params.isLong
      ? params.currentPriceRaw + slippageAmount  // Longs accept higher price
      : params.currentPriceRaw - slippageAmount  // Shorts accept lower price

    try {
      // Step 1: Approve if needed
      if (needsApproval(collateralUsdc)) {
        await approve()
      }

      // Step 2: Submit trade
      setStatus('submitting')
      const hash = await writeContractAsync({
        ...contracts.router,
        functionName: 'increasePosition',
        args: [params.indexToken, collateralUsdc, sizeDelta, params.isLong, acceptablePrice],
      })

      // Step 3: Wait for confirmation
      setStatus('confirming')
      await new Promise<void>((resolve, reject) => {
        const check = async () => {
          try {
            const receipt = await fetch(`http://127.0.0.1:8545`, {
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
          } catch (err) {
            reject(err)
          }
        }
        check()
      })

      setStatus('success')
      // Invalidate position and balance caches
      queryClient.invalidateQueries({ queryKey: ['readContract'] })
      queryClient.invalidateQueries({ queryKey: ['readContracts'] })

      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message.slice(0, 200))
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [contracts, address, approve, writeContractAsync, queryClient, needsApproval])

  const decreasePosition = useCallback(async (params: DecreaseParams) => {
    if (!contracts || !address) throw new Error('Not connected')

    setError(null)

    const slippageBps = BigInt(params.slippageBps ?? 30)
    const slippageAmount = (params.currentPriceRaw * slippageBps) / 10_000n
    // Closing: longs want higher price (sell high), shorts want lower (buy low)
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
      await new Promise<void>((resolve, reject) => {
        const check = async () => {
          try {
            const receipt = await fetch(`http://127.0.0.1:8545`, {
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
          } catch (err) {
            reject(err)
          }
        }
        check()
      })

      setStatus('success')
      queryClient.invalidateQueries({ queryKey: ['readContract'] })
      queryClient.invalidateQueries({ queryKey: ['readContracts'] })
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message.slice(0, 200))
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [contracts, address, writeContractAsync, queryClient])

  return {
    status,
    error,
    increasePosition,
    decreasePosition,
    needsApproval: (usdcAmount: bigint) => needsApproval(usdcAmount),
  }
}
