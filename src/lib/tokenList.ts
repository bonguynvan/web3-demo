/**
 * Arbitrum token list — fetch, cache, and search.
 *
 * Fetches from the Uniswap default token list, filters to Arbitrum One,
 * and merges with hardcoded defaults. Cached in-memory for the session.
 */

import type { Token } from '../types/spot'
import { ARBITRUM_CHAIN_ID, DEFAULT_TOKENS } from './spotConstants'

const UNISWAP_TOKEN_LIST_URL = 'https://tokens.uniswap.org'

// In-memory cache
let cachedTokens: Token[] | null = null
const tokensByAddress = new Map<string, Token>()

/**
 * Fetch the Arbitrum token list. Returns cached data on subsequent calls.
 * Falls back to DEFAULT_TOKENS if the remote fetch fails.
 */
export async function fetchTokenList(): Promise<Token[]> {
  if (cachedTokens) return cachedTokens

  try {
    const res = await fetch(UNISWAP_TOKEN_LIST_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const remoteTokens: Token[] = (data.tokens ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((t: any) => t.chainId === ARBITRUM_CHAIN_ID)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((t: any) => ({
        address: t.address as `0x${string}`,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.logoURI,
        chainId: ARBITRUM_CHAIN_ID,
      }))

    // Merge: defaults first (ensures popular tokens are always present),
    // then remote tokens that aren't already in defaults.
    const defaultAddresses = new Set(
      DEFAULT_TOKENS.map(t => t.address.toLowerCase()),
    )
    const merged = [
      ...DEFAULT_TOKENS,
      ...remoteTokens.filter(
        t => !defaultAddresses.has(t.address.toLowerCase()),
      ),
    ]

    cachedTokens = merged
    rebuildIndex(merged)
    return merged
  } catch {
    // Network failure — fall back to hardcoded popular tokens
    cachedTokens = DEFAULT_TOKENS
    rebuildIndex(DEFAULT_TOKENS)
    return DEFAULT_TOKENS
  }
}

function rebuildIndex(tokens: Token[]): void {
  tokensByAddress.clear()
  for (const t of tokens) {
    tokensByAddress.set(t.address.toLowerCase(), t)
  }
}

/** Look up a token by address (case-insensitive). */
export function getTokenByAddress(address: string): Token | undefined {
  return tokensByAddress.get(address.toLowerCase())
}

/**
 * Search tokens by symbol or name (case-insensitive substring match).
 * Returns at most 50 results. If query is empty, returns popular tokens.
 */
export function searchTokens(query: string, tokens: Token[]): Token[] {
  const q = query.trim().toLowerCase()
  if (!q) return getPopularTokens()

  return tokens
    .filter(
      t =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase() === q, // exact address match
    )
    .slice(0, 50)
}

/** Returns the hardcoded popular tokens for initial display. */
export function getPopularTokens(): Token[] {
  return DEFAULT_TOKENS
}

/** Clear the cache (useful for testing). */
export function clearTokenListCache(): void {
  cachedTokens = null
  tokensByAddress.clear()
}
