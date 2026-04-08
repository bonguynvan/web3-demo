/**
 * wagmi + viem configuration for the Perp DEX.
 *
 * Supports two connection modes:
 * 1. MetaMask/Rabby (injected) — for real wallet users
 * 2. Demo accounts — pre-funded Anvil accounts with built-in signing
 */

import { http, createConfig } from 'wagmi'
import { foundry } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { demoConnector, DEMO_ACCOUNTS } from './demoConnector'

export const wagmiConfig = createConfig({
  chains: [foundry],
  connectors: [
    // Demo accounts first (most convenient for dev)
    ...DEMO_ACCOUNTS.map(account => demoConnector({ account })),
    // Real wallets
    injected(),
  ],
  transports: {
    // Long polling interval — we don't need wagmi's block tracker.
    // Hooks that need data have their own refetchInterval.
    [foundry.id]: http('http://127.0.0.1:8545', {
      retryCount: 0,
      timeout: 5_000,
    }),
  },
  // Disable wagmi's auto block-number polling (was 4s by default)
  // Components that need fresh data poll independently.
  pollingInterval: 60_000, // 1 minute
})

// Re-export for convenience
export { DEMO_ACCOUNTS } from './demoConnector'
