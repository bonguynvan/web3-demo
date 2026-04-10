/**
 * Spot trading types — token swaps via 0x Swap API on Arbitrum.
 *
 * Separate from trading.ts (perp types) to keep concerns isolated.
 */

import type { Address } from 'viem'

/** ERC-20 token metadata (from token list or hardcoded defaults). */
export interface Token {
  address: Address
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  chainId: number
}

/** Indicative price returned by 0x /price endpoint. */
export interface SwapQuote {
  sellToken: Token
  buyToken: Token
  sellAmount: bigint
  buyAmount: bigint
  /** Human-readable exchange rate (buyAmount / sellAmount adjusted for decimals). */
  price: number
  estimatedPriceImpact: number
  estimatedGas: bigint
  sources: SwapSource[]
}

/** Firm quote returned by 0x /quote endpoint — includes tx data. */
export interface SwapFirmQuote extends SwapQuote {
  transaction: SwapTransaction
}

export interface SwapSource {
  name: string
  proportion: number
}

/** Ready-to-send transaction data from 0x. */
export interface SwapTransaction {
  to: Address
  data: `0x${string}`
  value: bigint
  gas: bigint
}

/** State machine for swap execution (mirrors perp TradeStatus pattern). */
export type SwapStatus =
  | 'idle'
  | 'fetching-quote'
  | 'approving'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'error'
