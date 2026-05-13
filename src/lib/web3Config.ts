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
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors'

// WalletConnect needs a free project id from https://cloud.walletconnect.com.
// Without it we omit that connector entirely; injected + Coinbase Wallet
// still cover ~95% of real users.
const WC_PROJECT_ID = (import.meta.env.VITE_WC_PROJECT_ID as string | undefined)?.trim()

const connectors = [
  injected({ shimDisconnect: true }),
  coinbaseWallet({
    appName: 'TradingDek',
    // 'all' enables smart-wallet flow (no extension required) when
    // supported and falls back to the Coinbase Wallet extension /
    // mobile app otherwise. Big UX win for users with no extension.
    preference: 'all',
  }),
  ...(WC_PROJECT_ID
    ? [walletConnect({
        projectId: WC_PROJECT_ID,
        metadata: {
          name: 'TradingDek',
          description: 'Research + bots for crypto trading',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://tradingdek.com',
          icons: [],
        },
        showQrModal: true,
      })]
    : []),
]

export const wagmiConfig = createConfig({
  chains: [arbitrum],
  connectors,
  transports: {
    [arbitrum.id]: http(
      import.meta.env.VITE_ARBITRUM_RPC_URL || undefined,
      { retryCount: 2, timeout: 10_000 },
    ),
  },
  pollingInterval: 60_000,
})
