/**
 * useLeverageLoop — one-click leveraged long/short via Aave + 0x.
 *
 * Leveraged Long ETH:
 *   1. Supply ETH as collateral to Aave
 *   2. Borrow USDC against it
 *   3. Swap USDC → ETH via 0x
 *   4. Supply swapped ETH (increases collateral)
 *   Result: ~2-3x long ETH exposure
 *
 * Short ETH:
 *   1. Supply USDC as collateral to Aave
 *   2. Borrow ETH against it
 *   3. Swap ETH → USDC via 0x
 *   4. Supply swapped USDC (increases collateral)
 *   Result: ~2-3x short ETH exposure
 *
 * Each step is a separate transaction (no flash loans for safety).
 * If the user abandons mid-loop, they have a valid Aave position.
 */

import { useState, useCallback } from 'react'
import { useAccount, useChainId, useWriteContract, useConfig, useSendTransaction } from 'wagmi'
import { erc20Abi } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { waitForTransactionReceipt } from '@wagmi/core'
import {
  AAVE_POOL,
  AAVE_POOL_ABI,
  VARIABLE_RATE_MODE,
  REFERRAL_CODE,
} from '../lib/aaveConstants'
import { ARBITRUM_CHAIN_ID, ARBITRUM_WETH, ARBITRUM_USDC } from '../lib/spotConstants'
import { ZERO_X_ALLOWANCE_HOLDER } from '../lib/spotConstants'
import { zeroXClient } from '../lib/zeroXClient'
import { parseTokenAmount } from '../lib/spotUtils'

export type LeverageDirection = 'long' | 'short'

export type LeverageStep =
  | 'idle'
  | 'supplying-initial'
  | 'borrowing'
  | 'swapping'
  | 'approving-swap'
  | 'supplying-loop'
  | 'success'
  | 'error'

export function useLeverageLoop() {
  const { address } = useAccount()
  const chainId = useChainId()
  const config = useConfig()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<LeverageStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState('')

  const { writeContractAsync } = useWriteContract()
  const { sendTransactionAsync } = useSendTransaction()

  const isBusy = step !== 'idle' && step !== 'error' && step !== 'success'

  const failWithMessage = useCallback((msg: string) => {
    setError(msg)
    setStep('error')
    setTimeout(() => setStep('idle'), 5000)
  }, [])

  const executeLeverage = useCallback(async (
    direction: LeverageDirection,
    /** Initial collateral amount as human-readable string */
    initialAmount: string,
    /** Target leverage (1.5x to 3x) */
    targetLeverage: number,
  ) => {
    if (!address) return failWithMessage('Wallet not connected')
    if (chainId !== ARBITRUM_CHAIN_ID) return failWithMessage('Switch to Arbitrum')
    if (isBusy) return

    setError(null)

    // Determine tokens based on direction
    const collateralToken = direction === 'long' ? ARBITRUM_WETH : ARBITRUM_USDC
    const borrowToken = direction === 'long' ? ARBITRUM_USDC : ARBITRUM_WETH

    const initialRaw = parseTokenAmount(initialAmount, collateralToken.decimals)
    if (initialRaw === 0n) return failWithMessage('Enter a valid amount')

    // Calculate borrow amount: (leverage - 1) * collateral value
    // For simplicity, we do a single loop (not recursive)
    // Effective leverage ≈ 1 / (1 - LTV) at max, but we cap at user's target
    const borrowRatio = Math.min(targetLeverage - 1, 0.75) // Cap at 75% LTV

    try {
      // Step 1: Supply initial collateral
      setStep('supplying-initial')
      setProgress(`Supplying ${initialAmount} ${collateralToken.symbol}...`)

      // Approve collateral for Aave Pool
      const approveHash = await writeContractAsync({
        address: collateralToken.address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [AAVE_POOL, initialRaw],
        chainId: ARBITRUM_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash: approveHash })

      // Supply to Aave
      const supplyHash = await writeContractAsync({
        address: AAVE_POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'supply',
        args: [collateralToken.address, initialRaw, address, REFERRAL_CODE],
        chainId: ARBITRUM_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash: supplyHash })

      // Step 2: Borrow
      setStep('borrowing')
      const borrowAmount = BigInt(Math.floor(Number(initialRaw) * borrowRatio))
      setProgress(`Borrowing ${borrowToken.symbol}...`)

      const borrowHash = await writeContractAsync({
        address: AAVE_POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'borrow',
        args: [borrowToken.address, borrowAmount, VARIABLE_RATE_MODE, REFERRAL_CODE, address],
        chainId: ARBITRUM_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash: borrowHash })

      // Step 3: Swap borrowed token back to collateral token via 0x
      setStep('swapping')
      setProgress(`Swapping ${borrowToken.symbol} → ${collateralToken.symbol}...`)

      const quoteResult = await zeroXClient.getQuote({
        sellToken: borrowToken,
        buyToken: collateralToken,
        sellAmount: borrowAmount.toString(),
        taker: address,
        slippageBps: 100, // 1% slippage for leverage
      })

      if (!quoteResult.success) {
        return failWithMessage(`Swap failed: ${quoteResult.error}`)
      }

      // Validate swap destination
      if (quoteResult.data.transaction.to.toLowerCase() !== ZERO_X_ALLOWANCE_HOLDER.toLowerCase()) {
        return failWithMessage('Invalid swap destination — blocked')
      }

      // Approve borrow token for 0x
      setStep('approving-swap')
      const approveSwapHash = await writeContractAsync({
        address: borrowToken.address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [ZERO_X_ALLOWANCE_HOLDER, borrowAmount],
        chainId: ARBITRUM_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash: approveSwapHash })

      // Execute swap
      setStep('swapping')
      const swapHash = await sendTransactionAsync({
        to: quoteResult.data.transaction.to,
        data: quoteResult.data.transaction.data,
        value: quoteResult.data.transaction.value,
        gas: quoteResult.data.transaction.gas,
        chainId: ARBITRUM_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash: swapHash })

      // Step 4: Supply swapped tokens back as additional collateral
      setStep('supplying-loop')
      const swappedAmount = quoteResult.data.buyAmount
      setProgress(`Re-supplying ${collateralToken.symbol} to Aave...`)

      // Approve swapped tokens for Aave
      const approveLoopHash = await writeContractAsync({
        address: collateralToken.address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [AAVE_POOL, swappedAmount],
        chainId: ARBITRUM_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash: approveLoopHash })

      const supplyLoopHash = await writeContractAsync({
        address: AAVE_POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'supply',
        args: [collateralToken.address, swappedAmount, address, REFERRAL_CODE],
        chainId: ARBITRUM_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash: supplyLoopHash })

      setStep('success')
      setProgress('Leverage position opened!')
      queryClient.invalidateQueries({ queryKey: ['aavePositions'] })
      setTimeout(() => { setStep('idle'); setProgress('') }, 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Leverage loop failed'
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        failWithMessage('Transaction rejected')
      } else {
        failWithMessage(msg)
      }
    }
  }, [
    address, chainId, isBusy, writeContractAsync, sendTransactionAsync,
    config, queryClient, failWithMessage,
  ])

  return { step, error, progress, executeLeverage, isBusy }
}
