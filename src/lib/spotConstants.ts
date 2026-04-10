/**
 * Spot trading constants — Arbitrum One addresses, 0x API config,
 * and well-known token defaults.
 */

import type { Address } from 'viem'
import type { Token } from '../types/spot'

// ─── Chain ──────────────────────────────────────────────────────────────────

export const ARBITRUM_CHAIN_ID = 42161

// ─── 0x Swap API ────────────────────────────────────────────────────────────

export const ZERO_X_API_BASE = 'https://api.0x.org'

/**
 * The 0x AllowanceHolder contract on Arbitrum.
 * Users approve this address to spend their sell tokens.
 * @see https://0x.org/docs/introduction/0x-cheat-sheet
 */
export const ZERO_X_ALLOWANCE_HOLDER: Address =
  '0x0000000000001fF3684f28c67538d4D072C22734'

/**
 * 0x convention for native ETH (not WETH) in swap params.
 * Using this address as sellToken tells 0x to accept raw ETH.
 */
export const NATIVE_ETH_ADDRESS: Address =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

// ─── Default Arbitrum tokens ────────────────────────────────────────────────
// Fallback set used when the remote token list fetch fails and for
// the "popular tokens" row in the token selector.

export const ARBITRUM_WETH: Token = {
  address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  symbol: 'WETH',
  name: 'Wrapped Ether',
  decimals: 18,
  chainId: ARBITRUM_CHAIN_ID,
}

export const ARBITRUM_USDC: Token = {
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  chainId: ARBITRUM_CHAIN_ID,
}

export const ARBITRUM_USDT: Token = {
  address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  symbol: 'USDT',
  name: 'Tether USD',
  decimals: 6,
  chainId: ARBITRUM_CHAIN_ID,
}

export const ARBITRUM_ARB: Token = {
  address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  symbol: 'ARB',
  name: 'Arbitrum',
  decimals: 18,
  chainId: ARBITRUM_CHAIN_ID,
}

export const ARBITRUM_DAI: Token = {
  address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  symbol: 'DAI',
  name: 'Dai Stablecoin',
  decimals: 18,
  chainId: ARBITRUM_CHAIN_ID,
}

export const ARBITRUM_WBTC: Token = {
  address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  symbol: 'WBTC',
  name: 'Wrapped BTC',
  decimals: 8,
  chainId: ARBITRUM_CHAIN_ID,
}

/** Native ETH pseudo-token (for 0x swap params, not a real ERC-20). */
export const NATIVE_ETH: Token = {
  address: NATIVE_ETH_ADDRESS,
  symbol: 'ETH',
  name: 'Ether',
  decimals: 18,
  chainId: ARBITRUM_CHAIN_ID,
}

/** Popular tokens shown by default in the token selector. */
export const DEFAULT_TOKENS: Token[] = [
  NATIVE_ETH,
  ARBITRUM_WETH,
  ARBITRUM_USDC,
  ARBITRUM_USDT,
  ARBITRUM_ARB,
  ARBITRUM_DAI,
  ARBITRUM_WBTC,
]
