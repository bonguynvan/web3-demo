/**
 * Precision conversion between frontend (18-dec FP), contracts (30-dec), and USDC (6-dec).
 *
 * The protocol uses THREE decimal formats:
 *   - USDC on-chain: 6 decimals  (1 USDC = 1_000_000)
 *   - Internal/price: 30 decimals (GMX convention, 1 USD = 1e30)
 *   - Frontend FP: 18 decimals   (1.0 = 1e18, used by fixedPoint.ts)
 *
 * Every contract interaction must convert between these formats.
 * All conversions are centralized here to prevent scattered BigInt math.
 */

import {
  PRICE_PRECISION,
  USDC_PRECISION,
  usdcToInternal,
  internalToUsdc,
  formatUsd as formatUsdInternal,
  formatLeverage,
} from '../../packages/contracts/typechain'

const WAD = 10n ** 18n // Frontend FP precision

// ─── USDC (6-dec) ↔ Internal (30-dec) ───

export { usdcToInternal, internalToUsdc }

// ─── Display number → USDC (6-dec) ───

/** Convert a display dollar amount (e.g. 1000.50) to USDC 6-dec */
export function dollarsToUsdc(dollars: number): bigint {
  // Use string conversion to avoid float precision issues
  const str = dollars.toFixed(6)
  const [intPart, decPart = ''] = str.split('.')
  const padded = decPart.padEnd(6, '0').slice(0, 6)
  return BigInt(intPart) * USDC_PRECISION + BigInt(padded)
}

/** Convert USDC 6-dec to display number */
export function usdcToDollars(usdc: bigint): number {
  return Number(usdc) / 1e6
}

// ─── Display number → Internal (30-dec) ───

/** Convert a display dollar amount to internal 30-dec */
export function dollarsToInternal(dollars: number): bigint {
  return usdcToInternal(dollarsToUsdc(dollars))
}

/** Convert internal 30-dec to display number */
export function internalToDollars(internal: bigint): number {
  return usdcToDollars(internalToUsdc(internal))
}

// ─── Frontend FP (18-dec) ↔ Internal (30-dec) ───

/** Convert frontend 18-dec BigInt to contract 30-dec */
export function fpToInternal(fp18: bigint): bigint {
  return fp18 * (PRICE_PRECISION / WAD) // multiply by 1e12
}

/** Convert contract 30-dec to frontend 18-dec BigInt */
export function internalToFp(internal30: bigint): bigint {
  return internal30 / (PRICE_PRECISION / WAD)
}

// ─── Frontend FP (18-dec) ↔ USDC (6-dec) ───

/** Convert frontend 18-dec BigInt to USDC 6-dec */
export function fpToUsdc(fp18: bigint): bigint {
  return fp18 / (WAD / USDC_PRECISION) // divide by 1e12
}

/** Convert USDC 6-dec to frontend 18-dec BigInt */
export function usdcToFp(usdc6: bigint): bigint {
  return usdc6 * (WAD / USDC_PRECISION)
}

// ─── Formatting ───

/** Format internal 30-dec amount as "$1,234.56" */
export { formatUsdInternal as formatUsd30 }

/** Format USDC 6-dec amount as "$1,234.56" */
export function formatUsdc(usdc: bigint, decimals = 2): string {
  const dollars = Number(usdc) / 1e6
  return dollars.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Format internal 30-dec price as a number (e.g., 3500.00) */
export function priceToNumber(internal30: bigint): number {
  return internalToDollars(internal30)
}

export { formatLeverage, PRICE_PRECISION, USDC_PRECISION }
