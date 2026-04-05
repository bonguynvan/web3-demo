/**
 * Web3Provider — wraps the app with wagmi + react-query context.
 *
 * WHY THIS WRAPPER:
 * =================
 * wagmi hooks (useAccount, useConnect, useSignTypedData) need two providers:
 *   1. WagmiProvider — manages wallet connections, chain state
 *   2. QueryClientProvider — caches and deduplicates RPC calls
 *
 * This is the standard setup for any wagmi-based dApp.
 * Without it, every component that reads on-chain data would make
 * its own RPC call. QueryClient deduplicates and caches them.
 */

import { type ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '../lib/web3Config'

// Shared query client — caches RPC responses, deduplicates in-flight requests
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // RPC data goes stale quickly (new block every 12s on mainnet)
      staleTime: 5_000,
      // Don't retry failed RPC calls aggressively
      retry: 2,
    },
  },
})

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
