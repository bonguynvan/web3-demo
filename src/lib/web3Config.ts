/**
 * wagmi + viem configuration for the DEX.
 *
 * WHY wagmi + viem (not ethers.js)?
 * =================================
 * - wagmi: React hooks for wallet connection, chain switching, transaction state
 * - viem: TypeScript-first, tree-shakeable, better BigInt support
 * - ethers.js: legacy, larger bundle, weaker types
 *
 * dYdX, Hyperliquid, and most modern DEXs use wagmi/viem.
 */

import { http, createConfig } from 'wagmi'
import { mainnet, sepolia, localhost } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

/**
 * Supported chains.
 *
 * In production, a DEX typically supports:
 * - Mainnet (Ethereum L1) for deposits/withdrawals
 * - An L2 or appchain for the actual trading (e.g., dYdX Chain, StarkEx)
 * - Testnet for development
 *
 * We include localhost for development with Hardhat/Anvil.
 */

// WalletConnect project ID — in production, get your own at cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID = 'demo-project-id'

export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia, localhost],
  connectors: [
    injected(),  // MetaMask, Rabby, etc.
    walletConnect({ projectId: WALLETCONNECT_PROJECT_ID }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [localhost.id]: http('http://127.0.0.1:8545'),
  },
})

/**
 * Contract addresses — in production these come from environment variables.
 * For the boilerplate, we use placeholder addresses.
 */
export const CONTRACTS = {
  // The settlement contract where matched trades are recorded on-chain
  settlement: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
  // The USDC (or other stablecoin) used as collateral
  collateral: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`, // USDC on mainnet
  // The deposit vault where users lock collateral
  vault: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`,
} as const
