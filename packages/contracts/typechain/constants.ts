// Protocol constants mirrored from Solidity for frontend use
// Must stay in sync with src/libraries/Constants.sol

/** 30-decimal internal price precision (GMX convention) */
export const PRICE_PRECISION = 10n ** 30n;

/** USDC uses 6 decimals */
export const USDC_DECIMALS = 6;
export const USDC_PRECISION = 10n ** 6n;

/** Chainlink uses 8 decimals */
export const CHAINLINK_DECIMALS = 8;

/** Basis points divisor */
export const BASIS_POINTS_DIVISOR = 10_000n;

/** Max leverage: 20x (200,000 basis points) */
export const MAX_LEVERAGE = 200_000n;

/** Min leverage: 1x */
export const MIN_LEVERAGE = 10_000n;

/** Default margin fee: 0.1% (10 bps) */
export const DEFAULT_MARGIN_FEE_BPS = 10n;

/** Liquidation fee: $5 */
export const LIQUIDATION_FEE_USD = 5n * PRICE_PRECISION;

/** Max pool utilization: 80% */
export const MAX_UTILIZATION_BPS = 8_000n;

// --- Conversion helpers ---

/** Convert USDC amount (6 dec) to internal precision (30 dec) */
export function usdcToInternal(usdcAmount: bigint): bigint {
  return usdcAmount * (PRICE_PRECISION / USDC_PRECISION);
}

/** Convert internal precision (30 dec) to USDC (6 dec), rounds down */
export function internalToUsdc(internalAmount: bigint): bigint {
  return internalAmount / (PRICE_PRECISION / USDC_PRECISION);
}

/** Convert a dollar amount to 30-decimal internal format */
export function usd(dollars: number): bigint {
  return BigInt(dollars) * PRICE_PRECISION;
}

/** Format internal 30-dec amount to human-readable USD string */
export function formatUsd(amount: bigint, decimals = 2): string {
  const usdcAmount = internalToUsdc(amount);
  const dollars = Number(usdcAmount) / 1e6;
  return dollars.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Calculate leverage in basis points */
export function getLeverageBps(size: bigint, collateral: bigint): bigint {
  if (collateral === 0n) return 0n;
  return (size * BASIS_POINTS_DIVISOR) / collateral;
}

/** Format leverage as "Xx" string */
export function formatLeverage(size: bigint, collateral: bigint): string {
  const bps = getLeverageBps(size, collateral);
  const leverage = Number(bps) / 10_000;
  return `${leverage.toFixed(1)}x`;
}
