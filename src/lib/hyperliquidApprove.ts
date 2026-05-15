/**
 * hyperliquidApprove — thin wrapper over @nktkas/hyperliquid's
 * `approveAgent` action.
 *
 * Why a wrapper:
 *   - Forces testnet during Phase 1 (mainnet throws until graduated)
 *   - Adapts the user's wagmi WalletClient into the SDK's `wallet`
 *     parameter (viem-compatible, signTypedData / signMessage)
 *   - Keeps the modal UI free of SDK schema noise
 */

import { HttpTransport } from '@nktkas/hyperliquid'
import { approveAgent } from '@nktkas/hyperliquid/api/exchange'
import type { AbstractWallet } from '@nktkas/hyperliquid/signing'
import type { WalletClient } from 'viem'
import { hlNetwork } from './hyperliquidAgent'

export interface ApproveAgentArgs {
  walletClient: WalletClient
  agentAddress: `0x${string}`
  agentName: string | null
}

/**
 * Adapter from a wagmi WalletClient into the SDK's AbstractWallet
 * shape. We only need `signTypedData` and `getAddresses` (the latter
 * for the SDK to resolve the signing account). wagmi guarantees both
 * are usable once `isConnected === true`.
 */
function adaptWallet(wc: WalletClient): AbstractWallet {
  return {
    signTypedData: (params: Parameters<WalletClient['signTypedData']>[0]) =>
      wc.signTypedData(params),
    getAddresses: () => wc.getAddresses(),
    request: wc.request.bind(wc),
  } as unknown as AbstractWallet
}

export async function approveHyperliquidAgent(args: ApproveAgentArgs): Promise<void> {
  const transport = new HttpTransport({ isTestnet: hlNetwork() === 'testnet' })

  await approveAgent(
    { transport, wallet: adaptWallet(args.walletClient) },
    {
      agentAddress: args.agentAddress,
      agentName: args.agentName,
    },
  )
}
