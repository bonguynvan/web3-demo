/**
 * wagmi + viem configuration for TradingDek.
 *
 * Post-pivot the product is venue-agnostic research + bots; wallet
 * connectivity is only needed for Hyperliquid signing. We register
 * Arbitrum so wagmi has a sane default chain for nonce/UX. Hyperliquid
 * itself runs on chainId 1337 with a custom RPC; signing is handled
 * outside wagmi.
 *
 * Foundry + demo accounts were pre-pivot artefacts that fired a stream
 * of ERR_CONNECTION_REFUSED against 127.0.0.1:8545 in DEV. Removed.
 */

import { http, createConfig } from 'wagmi'
import { arbitrum } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [arbitrum],
  connectors: [injected()],
  transports: {
    [arbitrum.id]: http(
      import.meta.env.VITE_ARBITRUM_RPC_URL || undefined,
      { retryCount: 2, timeout: 10_000 },
    ),
  },
  pollingInterval: 60_000,
})
