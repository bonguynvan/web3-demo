/**
 * Spot trading utilities — token amount parsing/formatting for
 * arbitrary ERC-20 decimals (6 for USDC, 8 for WBTC, 18 for WETH, etc.).
 *
 * Unlike precision.ts (which handles the fixed 6↔30↔18 perp pipeline),
 * these functions work with any decimal count.
 */

import { NATIVE_ETH_ADDRESS } from './spotConstants'
import type { Address } from 'viem'

/**
 * Parse a human-readable amount string into raw bigint units.
 *
 * @example parseTokenAmount('1.5', 18) → 1_500_000_000_000_000_000n
 * @example parseTokenAmount('100', 6)  → 100_000_000n
 */
export function parseTokenAmount(humanAmount: string, decimals: number): bigint {
  const trimmed = humanAmount.trim()
  if (!trimmed || trimmed === '.' || trimmed === '-') return 0n

  const [intPart = '0', decPart = ''] = trimmed.split('.')
  const paddedDec = decPart.slice(0, decimals).padEnd(decimals, '0')
  const intVal = BigInt(intPart || '0')
  const decVal = BigInt(paddedDec)
  return intVal * 10n ** BigInt(decimals) + decVal
}

/**
 * Format raw bigint token units into a human-readable string.
 *
 * @example formatTokenAmount(1_500_000_000_000_000_000n, 18, 4) → '1.5'
 * @example formatTokenAmount(100_000_000n, 6, 2) → '100.00'
 */
export function formatTokenAmount(
  raw: bigint,
  decimals: number,
  displayDecimals?: number,
): string {
  const divisor = 10n ** BigInt(decimals)
  const intPart = raw / divisor
  const remainder = raw % divisor

  const decStr = remainder.toString().padStart(decimals, '0')
  const trimmed = displayDecimals !== undefined
    ? decStr.slice(0, displayDecimals)
    : decStr.replace(/0+$/, '')

  if (!trimmed) return intPart.toString()
  return `${intPart}.${trimmed}`
}

/** Check if an address represents native ETH (the 0x convention). */
export function isNativeEth(address: Address): boolean {
  return address.toLowerCase() === NATIVE_ETH_ADDRESS.toLowerCase()
}

/**
 * Calculate price impact as a percentage.
 * Positive = favorable (got more than expected), negative = unfavorable.
 */
export function calculatePriceImpact(
  marketPrice: number,
  executionPrice: number,
): number {
  if (marketPrice === 0) return 0
  return ((executionPrice - marketPrice) / marketPrice) * 100
}

/**
 * Validate a user-entered amount string.
 * Returns true if the string can be parsed as a positive number.
 */
export function isValidAmount(amount: string): boolean {
  if (!amount.trim()) return false
  const num = Number(amount)
  return !isNaN(num) && num > 0 && isFinite(num)
}
