/**
 * useMarginExecution — Aave V3 supply/borrow/repay/withdraw state machine.
 *
 * Mirrors the pattern from useSwapExecution.ts:
 *   idle → approving → submitting → confirming → success | error
 */

import { useState, useCallback } from 'react'
import { useAccount, useChainId, useWriteContract, useConfig } from 'wagmi'
import { erc20Abi } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { waitForTransactionReceipt } from '@wagmi/core'
import type { MarginStatus, MarginAction } from '../types/margin'
import type { Token } from '../types/spot'
import {
  AAVE_POOL,
  AAVE_POOL_ABI,
  AAVE_WETH_GATEWAY,
  AAVE_WETH_GATEWAY_ABI,
  VARIABLE_RATE_MODE,
  REFERRAL_CODE,
} from '../lib/aaveConstants'
import { ARBITRUM_CHAIN_ID } from '../lib/spotConstants'
import { parseTokenAmount, isValidAmount, isNativeEth } from '../lib/spotUtils'

export function useMarginExecution() {
  const { address } = useAccount()
  const chainId = useChainId()
  const config = useConfig()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<MarginStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null)

  const { writeContractAsync } = useWriteContract()

  const isBusy = status !== 'idle' && status !== 'error' && status !== 'success'

  const failWithMessage = useCallback((msg: string) => {
    setError(msg)
    setStatus('error')
    setTimeout(() => setStatus('idle'), 5000)
  }, [])

  const execute = useCallback(async (
    action: MarginAction,
    asset: Token,
    amount: string,
  ) => {
    if (!address) return failWithMessage('Wallet not connected')
    if (chainId !== ARBITRUM_CHAIN_ID) return failWithMessage('Switch to Arbitrum')
    if (isBusy) return
    if (!isValidAmount(amount)) return failWithMessage('Enter a valid amount')

    setError(null)
    setLastTxHash(null)

    const rawAmount = parseTokenAmount(amount, asset.decimals)
    const isNative = isNativeEth(asset.address)

    try {
      // Approve if needed (supply and repay require ERC-20 approval)
      if ((action === 'supply' || action === 'repay') && !isNative) {
        setStatus('approving')
        const approveHash = await writeContractAsync({
          address: asset.address,
          abi: erc20Abi,
          functionName: 'approve',
          args: [AAVE_POOL, rawAmount],
          chainId: ARBITRUM_CHAIN_ID,
        })
        await waitForTransactionReceipt(config, { hash: approveHash })
      }

      setStatus('submitting')
      let hash: `0x${string}`

      switch (action) {
        case 'supply': {
          if (isNative) {
            hash = await writeContractAsync({
              address: AAVE_WETH_GATEWAY,
              abi: AAVE_WETH_GATEWAY_ABI,
              functionName: 'depositETH',
              args: [AAVE_POOL, address, REFERRAL_CODE],
              value: rawAmount,
              chainId: ARBITRUM_CHAIN_ID,
            })
          } else {
            hash = await writeContractAsync({
              address: AAVE_POOL,
              abi: AAVE_POOL_ABI,
              functionName: 'supply',
              args: [asset.address, rawAmount, address, REFERRAL_CODE],
              chainId: ARBITRUM_CHAIN_ID,
            })
          }
          break
        }

        case 'borrow': {
          hash = await writeContractAsync({
            address: AAVE_POOL,
            abi: AAVE_POOL_ABI,
            functionName: 'borrow',
            args: [asset.address, rawAmount, VARIABLE_RATE_MODE, REFERRAL_CODE, address],
            chainId: ARBITRUM_CHAIN_ID,
          })
          break
        }

        case 'repay': {
          if (isNative) {
            hash = await writeContractAsync({
              address: AAVE_WETH_GATEWAY,
              abi: AAVE_WETH_GATEWAY_ABI,
              functionName: 'repayETH',
              args: [AAVE_POOL, rawAmount, VARIABLE_RATE_MODE, address],
              value: rawAmount,
              chainId: ARBITRUM_CHAIN_ID,
            })
          } else {
            hash = await writeContractAsync({
              address: AAVE_POOL,
              abi: AAVE_POOL_ABI,
              functionName: 'repay',
              args: [asset.address, rawAmount, VARIABLE_RATE_MODE, address],
              chainId: ARBITRUM_CHAIN_ID,
            })
          }
          break
        }

        case 'withdraw': {
          if (isNative) {
            hash = await writeContractAsync({
              address: AAVE_WETH_GATEWAY,
              abi: AAVE_WETH_GATEWAY_ABI,
              functionName: 'withdrawETH',
              args: [AAVE_POOL, rawAmount, address],
              chainId: ARBITRUM_CHAIN_ID,
            })
          } else {
            hash = await writeContractAsync({
              address: AAVE_POOL,
              abi: AAVE_POOL_ABI,
              functionName: 'withdraw',
              args: [asset.address, rawAmount, address],
              chainId: ARBITRUM_CHAIN_ID,
            })
          }
          break
        }
      }

      setLastTxHash(hash)

      setStatus('confirming')
      await waitForTransactionReceipt(config, { hash })

      setStatus('success')
      queryClient.invalidateQueries({ queryKey: ['aavePositions'] })
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        failWithMessage('Transaction rejected')
      } else {
        failWithMessage(msg)
      }
    }
  }, [
    address, chainId, isBusy, writeContractAsync, config,
    queryClient, failWithMessage,
  ])

  return { status, error, lastTxHash, execute }
}
