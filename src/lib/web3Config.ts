/**
 * wagmi + viem configuration for the Perp DEX.
 *
 * Configured for local Anvil development (chainId 31337).
 * In production, add Arbitrum/Base chains and update transports.
 */

import { http, createConfig } from 'wagmi'
import { foundry } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [foundry],
  connectors: [
    injected(), // MetaMask, Rabby, etc.
  ],
  transports: {
    [foundry.id]: http('http://127.0.0.1:8545'),
  },
})
