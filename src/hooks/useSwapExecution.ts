/**
 * useSwapExecution — approval + swap transaction state machine.
 *
 * Mirrors the pattern from useTradeExecution.ts:
 *   idle → fetching-quote → approving → submitting → confirming → success | error
 *
 * Steps:
 * 1. Fetch firm quote from 0x (with tx data)
 * 2. Check ERC-20 allowance → approve if needed (skip for native ETH)
 * 3. Send the swap transaction
 * 4. Wait for confirmation
 */

import { useState, useCallback } from 'react'
import { useAccount, useChainId, useReadContract, useSendTransaction, useConfig } from 'wagmi'
import { erc20Abi, maxUint256 } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from '@wagmi/core'
import type { SwapStatus } from '../types/spot'
import { zeroXClient, type SwapParams } from '../lib/zeroXClient'
import { isNativeEth } from '../lib/spotUtils'
import { ZERO_X_ALLOWANCE_HOLDER, ARBITRUM_CHAIN_ID } from '../lib/spotConstants'
import { useSpotStore } from '../store/spotStore'
import { useSwapHistoryStore } from '../store/swapHistoryStore'
import { parseTokenAmount, isValidAmount, formatTokenAmount } from '../lib/spotUtils'

export function useSwapExecution() {
  const { address } = useAccount()
  const chainId = useChainId()
  const config = useConfig()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<SwapStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null)

  const { sellToken, buyToken, sellAmount, slippageBps } = useSpotStore()
  const addHistoryEntry = useSwapHistoryStore(s => s.addEntry)

  const { writeContractAsync } = useWriteContract()
  const { sendTransactionAsync } = useSendTransaction()

  // Read current allowance for the sell token against 0x AllowanceHolder
  const isNative = isNativeEth(sellToken.address)
  const { data: allowance } = useReadContract({
    address: sellToken.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, ZERO_X_ALLOWANCE_HOLDER] : undefined,
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      enabled: !isNative && !!address,
    },
  })

  const currentAllowance = (allowance as bigint) ?? 0n

  const needsApproval = useCallback(
    (amount: bigint): boolean => {
      if (isNative) return false
      return currentAllowance < amount
    },
    [currentAllowance, isNative],
  )

  const isBusy = status !== 'idle' && status !== 'error' && status !== 'success'

  const failWithMessage = useCallback((msg: string) => {
    setError(msg)
    setStatus('error')
    setTimeout(() => setStatus('idle'), 5000)
  }, [])

  const executeSwap = useCallback(async () => {
    if (!address) return failWithMessage('Wallet not connected')
    if (chainId !== ARBITRUM_CHAIN_ID) return failWithMessage('Switch to Arbitrum')
    if (isBusy) return
    if (!isValidAmount(sellAmount)) return failWithMessage('Enter a valid amount')

    setError(null)
    setLastTxHash(null)

    const rawSellAmount = parseTokenAmount(sellAmount, sellToken.decimals)

    const params: SwapParams = {
      sellToken,
      buyToken,
      sellAmount: rawSellAmount.toString(),
      taker: address,
      slippageBps,
    }

    try {
      // 1. Fetch firm quote
      setStatus('fetching-quote')
      const quoteResult = await zeroXClient.getQuote(params)
      if (!quoteResult.success) {
        return failWithMessage(quoteResult.error)
      }
      const { transaction } = quoteResult.data

      // 2. Approve if needed (skip for native ETH)
      if (!isNative && needsApproval(rawSellAmount)) {
        setStatus('approving')
        const approveHash = await writeContractAsync({
          address: sellToken.address,
          abi: erc20Abi,
          functionName: 'approve',
          args: [ZERO_X_ALLOWANCE_HOLDER, maxUint256],
          chainId: ARBITRUM_CHAIN_ID,
        })
        await waitForTransactionReceipt(config, { hash: approveHash })
      }

      // 3. Send the swap transaction
      setStatus('submitting')
      const hash = await sendTransactionAsync({
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
        gas: transaction.gas,
        chainId: ARBITRUM_CHAIN_ID,
      })
      setLastTxHash(hash)

      // 4. Wait for confirmation
      setStatus('confirming')
      await waitForTransactionReceipt(config, { hash })

      setStatus('success')

      // Record swap in history
      addHistoryEntry(address, {
        id: `${hash}-${Date.now()}`,
        timestamp: Date.now(),
        txHash: hash,
        sellToken: { symbol: sellToken.symbol, address: sellToken.address },
        buyToken: { symbol: buyToken.symbol, address: buyToken.address },
        sellAmount: formatTokenAmount(rawSellAmount, sellToken.decimals, 6),
        buyAmount: formatTokenAmount(quoteResult.data.buyAmount, buyToken.decimals, 6),
        price: quoteResult.data.price,
        status: 'confirmed',
      })

      // Invalidate token balance queries so UI updates
      queryClient.invalidateQueries({ queryKey: ['swapQuote'] })
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Swap failed'
      // Detect user rejection
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        failWithMessage('Transaction rejected')
      } else {
        failWithMessage(msg)
      }
    }
  }, [
    address, chainId, isBusy, sellAmount, sellToken, buyToken, slippageBps,
    isNative, needsApproval, writeContractAsync, sendTransactionAsync,
    config, queryClient, failWithMessage, addHistoryEntry,
  ])

  return {
    status,
    error,
    lastTxHash,
    executeSwap,
    needsApproval: (amount: bigint) => needsApproval(amount),
  }
}
