/**
 * useErc20Balance — generic ERC-20 balance for any token.
 *
 * Unlike useTokenBalance.ts (which is perp-specific and hardcoded to USDC),
 * this hook works with any ERC-20 address and handles native ETH.
 */

import { useAccount, useBalance, useReadContract } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { isNativeEth } from '../lib/spotUtils'
import { formatTokenAmount } from '../lib/spotUtils'

interface UseErc20BalanceParams {
  tokenAddress: Address
  decimals: number
  chainId?: number
}

export function useErc20Balance({ tokenAddress, decimals, chainId }: UseErc20BalanceParams) {
  const { address } = useAccount()
  const isNative = isNativeEth(tokenAddress)

  // Native ETH — use wagmi's useBalance
  const ethBalance = useBalance({
    address,
    chainId,
    query: {
      enabled: isNative && !!address,
      refetchInterval: 10_000,
    },
  })

  // ERC-20 — read balanceOf directly
  const erc20Balance = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: !isNative && !!address,
      refetchInterval: 10_000,
    },
  })

  if (isNative) {
    const raw = ethBalance.data?.value ?? 0n
    return {
      raw,
      formatted: formatTokenAmount(raw, decimals, 6),
      isLoading: ethBalance.isLoading,
    }
  }

  const raw = (erc20Balance.data as bigint) ?? 0n
  return {
    raw,
    formatted: formatTokenAmount(raw, decimals, 6),
    isLoading: erc20Balance.isLoading,
  }
}
