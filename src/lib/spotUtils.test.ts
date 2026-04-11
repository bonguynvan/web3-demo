import { describe, it, expect } from 'vitest'
import {
  parseTokenAmount,
  formatTokenAmount,
  isNativeEth,
  calculatePriceImpact,
  isValidAmount,
} from './spotUtils'

describe('parseTokenAmount', () => {
  it('parses integer amounts with 18 decimals', () => {
    expect(parseTokenAmount('1', 18)).toBe(10n ** 18n)
  })

  it('parses integer amounts with 6 decimals (USDC)', () => {
    expect(parseTokenAmount('100', 6)).toBe(100_000_000n)
  })

  it('parses decimal amounts with 18 decimals', () => {
    expect(parseTokenAmount('1.5', 18)).toBe(1_500_000_000_000_000_000n)
  })

  it('parses decimal amounts with 6 decimals', () => {
    expect(parseTokenAmount('1.5', 6)).toBe(1_500_000n)
  })

  it('truncates excess decimal places', () => {
    // 1.1234567 with 6 decimals → truncated to 1.123456
    expect(parseTokenAmount('1.1234567', 6)).toBe(1_123_456n)
  })

  it('pads short decimal places', () => {
    expect(parseTokenAmount('1.1', 6)).toBe(1_100_000n)
  })

  it('handles zero', () => {
    expect(parseTokenAmount('0', 18)).toBe(0n)
    expect(parseTokenAmount('0.0', 6)).toBe(0n)
  })

  it('returns 0n for empty or invalid input', () => {
    expect(parseTokenAmount('', 18)).toBe(0n)
    expect(parseTokenAmount('.', 18)).toBe(0n)
    expect(parseTokenAmount('-', 18)).toBe(0n)
  })

  it('handles 8 decimals (WBTC)', () => {
    expect(parseTokenAmount('0.5', 8)).toBe(50_000_000n)
  })

  it('handles large amounts', () => {
    expect(parseTokenAmount('1000000', 6)).toBe(1_000_000_000_000n)
  })
})

describe('formatTokenAmount', () => {
  it('formats 18-decimal amounts', () => {
    expect(formatTokenAmount(1_500_000_000_000_000_000n, 18)).toBe('1.5')
  })

  it('formats 6-decimal amounts (USDC)', () => {
    expect(formatTokenAmount(100_000_000n, 6)).toBe('100')
  })

  it('formats with fixed display decimals', () => {
    expect(formatTokenAmount(1_500_000n, 6, 2)).toBe('1.50')
  })

  it('formats zero', () => {
    expect(formatTokenAmount(0n, 18)).toBe('0')
  })

  it('trims trailing zeros when displayDecimals not specified', () => {
    expect(formatTokenAmount(1_000_000n, 6)).toBe('1')
  })

  it('preserves trailing zeros when displayDecimals specified', () => {
    expect(formatTokenAmount(1_000_000n, 6, 6)).toBe('1.000000')
  })

  it('handles 8 decimals (WBTC)', () => {
    expect(formatTokenAmount(50_000_000n, 8, 4)).toBe('0.5000')
  })
})

describe('isNativeEth', () => {
  it('returns true for 0xEeee... address', () => {
    expect(isNativeEth('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isNativeEth('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')).toBe(true)
  })

  it('returns false for a regular address', () => {
    expect(isNativeEth('0xaf88d065e77c8cC2239327C5EDb3A432268e5831')).toBe(false)
  })
})

describe('calculatePriceImpact', () => {
  it('returns 0 when market price is 0', () => {
    expect(calculatePriceImpact(0, 100)).toBe(0)
  })

  it('calculates positive impact (got more)', () => {
    // Market price 100, execution price 101 → +1%
    expect(calculatePriceImpact(100, 101)).toBeCloseTo(1)
  })

  it('calculates negative impact (got less)', () => {
    // Market price 100, execution price 99 → -1%
    expect(calculatePriceImpact(100, 99)).toBeCloseTo(-1)
  })

  it('handles no impact', () => {
    expect(calculatePriceImpact(3500, 3500)).toBe(0)
  })
})

describe('isValidAmount', () => {
  it('returns true for valid positive numbers', () => {
    expect(isValidAmount('1')).toBe(true)
    expect(isValidAmount('0.5')).toBe(true)
    expect(isValidAmount('1000.123')).toBe(true)
  })

  it('returns false for empty/zero/invalid', () => {
    expect(isValidAmount('')).toBe(false)
    expect(isValidAmount('0')).toBe(false)
    expect(isValidAmount('-1')).toBe(false)
    expect(isValidAmount('abc')).toBe(false)
    expect(isValidAmount('  ')).toBe(false)
  })
})
