import { waitForTransactionReceipt } from '@wagmi/core'
import type { Config } from 'wagmi'

/**
 * Wait for a transaction receipt using wagmi's transport (not a hardcoded RPC URL).
 * Throws if the transaction reverts.
 */
export async function waitForTxReceipt(config: Config, hash: `0x${string}`): Promise<void> {
  const receipt = await waitForTransactionReceipt(config, {
    hash,
    confirmations: 1,
  })
  if (receipt.status === 'reverted') {
    throw new Error('Transaction reverted')
  }
}
