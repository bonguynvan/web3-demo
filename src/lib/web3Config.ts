/**
 * wagmi + viem configuration for the DeFi Trading Platform.
 *
 * Supports two chains:
 * - Foundry (Anvil) — local dev with demo accounts
 * - Arbitrum One — production (spot trading via 0x, perps via GMX-style contracts)
 *
 * Supports two connection modes:
 * 1. MetaMask/Rabby (injected) — for real wallet users
 * 2. Demo accounts — pre-funded Anvil accounts with built-in signing
 */

import { http, createConfig } from 'wagmi'
import { foundry, arbitrum } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { demoConnector, DEMO_ACCOUNTS } from './demoConnector'

export const wagmiConfig = createConfig({
  chains: [foundry, arbitrum],
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
    [arbitrum.id]: http(
      import.meta.env.VITE_ARBITRUM_RPC_URL || undefined,
      { retryCount: 2, timeout: 10_000 },
    ),
  },
  // Disable wagmi's auto block-number polling (was 4s by default)
  // Components that need fresh data poll independently.
  pollingInterval: 60_000, // 1 minute
})

// Re-export for convenience
export { DEMO_ACCOUNTS } from './demoConnector'
