/**
 * 0x Swap API v2 client for Arbitrum One.
 *
 * Two-step flow:
 * 1. getPrice() — indicative quote for live preview (no commitment)
 * 2. getQuote() — firm quote with ready-to-send transaction data
 *
 * @see https://0x.org/docs/api#tag/Swap
 */

import type { Address } from 'viem'
import type { SwapQuote, SwapFirmQuote, SwapSource, SwapTransaction, Token } from '../types/spot'
import { ZERO_X_API_BASE, ARBITRUM_CHAIN_ID } from './spotConstants'
import { formatTokenAmount } from './spotUtils'

// ─── Request types ──────────────────────────────────────────────────────────

export interface SwapParams {
  sellToken: Token
  buyToken: Token
  /** Raw sell amount in token's smallest unit (bigint as string). */
  sellAmount: string
  /** Taker wallet address. */
  taker: Address
  /** Slippage in basis points (e.g. 50 = 0.5%). */
  slippageBps?: number
}

// ─── Response envelope ──────────────────────────────────────────────────────

interface ZeroXSuccess<T> {
  success: true
  data: T
}

interface ZeroXError {
  success: false
  error: string
}

type ZeroXResponse<T> = ZeroXSuccess<T> | ZeroXError

// ─── API client ─────────────────────────────────────────────────────────────

const API_KEY = import.meta.env.VITE_0X_API_KEY ?? ''

function headers(): HeadersInit {
  const h: HeadersInit = {
    'Content-Type': 'application/json',
    '0x-chain-id': `eip155:${ARBITRUM_CHAIN_ID}`,
    '0x-version': '2',
  }
  if (API_KEY) h['0x-api-key'] = API_KEY
  return h
}

function buildUrl(
  endpoint: string,
  params: SwapParams,
): string {
  const url = new URL(`${ZERO_X_API_BASE}/swap/allowance-holder/${endpoint}`)
  url.searchParams.set('chainId', String(ARBITRUM_CHAIN_ID))
  url.searchParams.set('sellToken', params.sellToken.address)
  url.searchParams.set('buyToken', params.buyToken.address)
  url.searchParams.set('sellAmount', params.sellAmount)
  url.searchParams.set('taker', params.taker)
  if (params.slippageBps !== undefined) {
    url.searchParams.set('slippageBps', String(params.slippageBps))
  }
  return url.toString()
}

/**
 * Parse the 0x API response into our SwapQuote type.
 * The raw API response has different field names — we normalize them here.
 */
function parseQuoteResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
  sellToken: Token,
  buyToken: Token,
): SwapQuote {
  const sellAmount = BigInt(raw.sellAmount ?? '0')
  const buyAmount = BigInt(raw.buyAmount ?? '0')

  // Calculate human-readable price
  const sellFormatted = Number(formatTokenAmount(sellAmount, sellToken.decimals))
  const buyFormatted = Number(formatTokenAmount(buyAmount, buyToken.decimals))
  const price = sellFormatted > 0 ? buyFormatted / sellFormatted : 0

  // Parse liquidity sources
  const sources: SwapSource[] = (raw.route?.fills ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fill: any) => ({
      name: fill.source ?? 'Unknown',
      proportion: Number(fill.proportionBps ?? 0) / 10000,
    }),
  )

  return {
    sellToken,
    buyToken,
    sellAmount,
    buyAmount,
    price,
    estimatedPriceImpact: Number(raw.estimatedPriceImpact ?? 0),
    estimatedGas: BigInt(raw.transaction?.gas ?? raw.gas ?? '0'),
    sources,
  }
}

export const zeroXClient = {
  /**
   * Indicative price — no tx data, no commitment.
   * Use for live preview as the user types.
   */
  async getPrice(params: SwapParams): Promise<ZeroXResponse<SwapQuote>> {
    try {
      const url = buildUrl('price', params)
      const res = await fetch(url, { headers: headers() })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body?.reason ?? body?.description ?? `HTTP ${res.status}`
        return { success: false, error: msg }
      }

      const raw = await res.json()
      const quote = parseQuoteResponse(raw, params.sellToken, params.buyToken)
      return { success: true, data: quote }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      return { success: false, error: msg }
    }
  },

  /**
   * Firm quote — returns transaction data ready to send via wagmi.
   * Call only when the user confirms the swap.
   */
  async getQuote(params: SwapParams): Promise<ZeroXResponse<SwapFirmQuote>> {
    try {
      const url = buildUrl('quote', params)
      const res = await fetch(url, { headers: headers() })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body?.reason ?? body?.description ?? `HTTP ${res.status}`
        return { success: false, error: msg }
      }

      const raw = await res.json()
      const quote = parseQuoteResponse(raw, params.sellToken, params.buyToken)

      const tx: SwapTransaction = {
        to: raw.transaction.to as Address,
        data: raw.transaction.data as `0x${string}`,
        value: BigInt(raw.transaction.value ?? '0'),
        gas: BigInt(raw.transaction.gas ?? '0'),
      }

      return {
        success: true,
        data: { ...quote, transaction: tx },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      return { success: false, error: msg }
    }
  },
}
