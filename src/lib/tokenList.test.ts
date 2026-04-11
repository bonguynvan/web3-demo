import { describe, it, expect, beforeEach } from 'vitest'
import {
  searchTokens,
  getPopularTokens,
  clearTokenListCache,
} from './tokenList'
import { DEFAULT_TOKENS } from './spotConstants'
import type { Token } from '../types/spot'

// Build a test token set that includes defaults + some extras
const extraTokens: Token[] = [
  {
    address: '0x1111111111111111111111111111111111111111',
    symbol: 'TEST',
    name: 'Test Token',
    decimals: 18,
    chainId: 42161,
  },
  {
    address: '0x2222222222222222222222222222222222222222',
    symbol: 'MAGIC',
    name: 'Magic Token',
    decimals: 18,
    chainId: 42161,
  },
]

const allTokens = [...DEFAULT_TOKENS, ...extraTokens]

beforeEach(() => {
  clearTokenListCache()
})

describe('searchTokens', () => {
  it('returns popular tokens when query is empty', () => {
    const results = searchTokens('', allTokens)
    expect(results).toEqual(getPopularTokens())
  })

  it('searches by symbol (case-insensitive)', () => {
    const results = searchTokens('eth', allTokens)
    expect(results.some(t => t.symbol === 'ETH')).toBe(true)
    expect(results.some(t => t.symbol === 'WETH')).toBe(true)
  })

  it('searches by name', () => {
    const results = searchTokens('magic', allTokens)
    expect(results).toHaveLength(1)
    expect(results[0].symbol).toBe('MAGIC')
  })

  it('searches by exact address', () => {
    const results = searchTokens('0x1111111111111111111111111111111111111111', allTokens)
    expect(results).toHaveLength(1)
    expect(results[0].symbol).toBe('TEST')
  })

  it('limits results to 50', () => {
    // Create 100 fake tokens
    const manyTokens: Token[] = Array.from({ length: 100 }, (_, i) => ({
      address: `0x${i.toString().padStart(40, '0')}` as `0x${string}`,
      symbol: `TKN${i}`,
      name: `Token ${i}`,
      decimals: 18,
      chainId: 42161,
    }))
    const results = searchTokens('TKN', manyTokens)
    expect(results).toHaveLength(50)
  })

  it('returns empty array for no matches', () => {
    const results = searchTokens('zzzzzzzzz', allTokens)
    expect(results).toHaveLength(0)
  })
})

describe('getPopularTokens', () => {
  it('returns DEFAULT_TOKENS', () => {
    expect(getPopularTokens()).toEqual(DEFAULT_TOKENS)
  })

  it('includes ETH, USDC, and ARB', () => {
    const symbols = getPopularTokens().map(t => t.symbol)
    expect(symbols).toContain('ETH')
    expect(symbols).toContain('USDC')
    expect(symbols).toContain('ARB')
  })
})
