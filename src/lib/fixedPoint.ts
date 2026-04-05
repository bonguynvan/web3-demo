/**
 * FixedPoint18 — Blockchain-precision arithmetic using BigInt.
 *
 * WHY THIS EXISTS:
 * ================
 * Blockchain stores all values as integers with 18 decimal places.
 *   $1.00 = 1_000_000_000_000_000_000n (1e18)
 *   $0.01 = 10_000_000_000_000_000n   (1e16)
 *
 * JavaScript's `number` type (64-bit float) loses precision above 2^53:
 *   0.1 + 0.2 = 0.30000000000000004  ← WRONG for money
 *   Number(999_999_999_999_999_999n) = 1000000000000000000  ← WRONG
 *
 * In a DEX, these tiny errors compound with leverage:
 *   $0.0001 error × 100x leverage × 1000 ETH = $10 wrong PnL
 *
 * So ALL math goes through BigInt. We only convert to `number` at the
 * very last moment — when displaying to the user.
 *
 * USAGE:
 * ======
 *   const price = FP.fromNumber(3245.67)     // → 3245670000000000000000n
 *   const size  = FP.fromNumber(5.2)          // → 5200000000000000000n
 *   const notional = FP.mul(price, size)       // → exact BigInt result
 *   const display  = FP.toNumber(notional, 2)  // → 16877.48 (for UI only)
 */

// 1e18 as BigInt — the universal scaling factor
const WAD = 10n ** 18n

// Half a WAD — used for rounding
const HALF_WAD = WAD / 2n

export const FP = {
  WAD,

  ZERO: 0n,

  // ---- Conversions ----

  /** Convert a JS number to 18-decimal BigInt. Input should be a "human" number like 3245.67 */
  fromNumber(n: number): bigint {
    // We convert via string to avoid floating point precision loss.
    // e.g., fromNumber(0.1) should give exactly 100000000000000000n, not 99999999999999996n
    if (n === 0) return 0n

    // Use toPrecision(15) to strip floating-point noise digits,
    // then manually split and pad to 18 decimals.
    // Why 15? JS numbers have ~15-17 significant digits. toPrecision(15)
    // removes the noise tail (e.g., 0.100000000000000006 → 0.100000000000000).
    const sign = n < 0 ? -1n : 1n
    const abs = Math.abs(n)
    const str = abs.toPrecision(15)

    // Handle scientific notation (e.g., 1e-7)
    let fixed: string
    if (str.includes('e') || str.includes('E')) {
      fixed = abs.toFixed(18)
    } else {
      fixed = str
    }

    const [intPart, decPart = ''] = fixed.split('.')
    const paddedDec = decPart.padEnd(18, '0').slice(0, 18)
    return sign * (BigInt(intPart) * WAD + BigInt(paddedDec))
  },

  /** Convert a string amount (like from user input "3245.67") to 18-decimal BigInt */
  fromString(s: string): bigint {
    if (!s || s === '0') return 0n
    const negative = s.startsWith('-')
    const clean = s.replace('-', '')
    const [intPart, decPart = ''] = clean.split('.')
    const paddedDec = decPart.padEnd(18, '0').slice(0, 18)
    const result = BigInt(intPart || '0') * WAD + BigInt(paddedDec)
    return negative ? -result : result
  },

  /** Convert from on-chain uint256 (already in 18 decimals) — just wraps BigInt() */
  fromRaw(raw: bigint): bigint {
    return raw
  },

  /** Convert to JS number for display. ONLY use this for UI rendering, never for further math. */
  toNumber(value: bigint, displayDecimals: number = 2): number {
    const sign = value < 0n ? -1 : 1
    const abs = value < 0n ? -value : value
    const intPart = abs / WAD
    const fracPart = abs % WAD

    // Convert fractional part to string with leading zeros
    const fracStr = fracPart.toString().padStart(18, '0')
    const num = parseFloat(`${intPart}.${fracStr}`)

    return sign * parseFloat(num.toFixed(displayDecimals))
  },

  /** Format as display string with commas: "3,245.67" */
  toDisplay(value: bigint, decimals: number = 2): string {
    const num = FP.toNumber(value, decimals)
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  },

  // ---- Arithmetic ----
  // All operations maintain 18-decimal precision

  /** a + b */
  add(a: bigint, b: bigint): bigint {
    return a + b
  },

  /** a - b */
  sub(a: bigint, b: bigint): bigint {
    return a - b
  },

  /**
   * Multiply two 18-decimal values: (a * b) / 1e18
   * Both inputs and output are in 18-decimal format.
   *
   * Why divide by WAD? Because:
   *   a = realA * 1e18
   *   b = realB * 1e18
   *   a * b = realA * realB * 1e36  ← too many decimals!
   *   (a * b) / 1e18 = realA * realB * 1e18  ← correct
   */
  mul(a: bigint, b: bigint): bigint {
    return (a * b + HALF_WAD) / WAD  // HALF_WAD for rounding
  },

  /**
   * Divide two 18-decimal values: (a * 1e18) / b
   *
   * Why multiply by WAD first? Because:
   *   a = realA * 1e18
   *   b = realB * 1e18
   *   a / b = realA / realB  ← lost the 1e18 scaling!
   *   (a * 1e18) / b = (realA / realB) * 1e18  ← correct
   */
  div(a: bigint, b: bigint): bigint {
    if (b === 0n) throw new Error('FixedPoint18: division by zero')
    return (a * WAD + HALF_WAD) / b
  },

  /** Absolute value */
  abs(a: bigint): bigint {
    return a < 0n ? -a : a
  },

  /** Percentage: (value * bps) / 10000, where bps is basis points (100 = 1%) */
  pct(value: bigint, bps: number): bigint {
    return (value * BigInt(bps)) / 10000n
  },

  /** Compare: returns -1, 0, or 1 */
  cmp(a: bigint, b: bigint): -1 | 0 | 1 {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  },

  /** Is value negative? */
  isNeg(a: bigint): boolean {
    return a < 0n
  },

  // ---- Trading Calculations ----
  // These are the core formulas used in perpetual futures trading.

  /**
   * Notional Value = size × price
   *
   * Example: 5.2 ETH × $3245.67 = $16,877.48
   * In BigInt: mul(5.2e18, 3245.67e18) = 16877.484e18
   */
  notional(size: bigint, price: bigint): bigint {
    return FP.mul(size, price)
  },

  /**
   * Margin Required = notional / leverage
   *
   * With 10x leverage on $16,877.48 notional:
   *   margin = $16,877.48 / 10 = $1,687.75
   *
   * This is how much collateral the trader must deposit.
   */
  marginRequired(size: bigint, price: bigint, leverage: bigint): bigint {
    const notionalVal = FP.mul(size, price)
    return FP.div(notionalVal, leverage)
  },

  /**
   * Unrealized PnL (Profit and Loss)
   *
   * For LONG:  PnL = size × (markPrice - entryPrice)
   *   You bought low, price went up → profit
   *
   * For SHORT: PnL = size × (entryPrice - markPrice)
   *   You sold high, price went down → profit
   *
   * Example (Long 5.2 ETH, entry $3198.45, mark $3245.89):
   *   PnL = 5.2 × (3245.89 - 3198.45) = 5.2 × 47.44 = $246.69
   */
  unrealizedPnl(
    side: 'long' | 'short',
    size: bigint,
    entryPrice: bigint,
    markPrice: bigint,
  ): bigint {
    const priceDiff = side === 'long'
      ? FP.sub(markPrice, entryPrice)
      : FP.sub(entryPrice, markPrice)
    return FP.mul(size, priceDiff)
  },

  /**
   * PnL as ROE% (Return on Equity) = (pnl / margin) × 100
   *
   * With leverage, a small price move = large ROE:
   *   $246.69 PnL / $1,663.19 margin = 14.83% ROE
   *   (but the price only moved 1.48% — that's the power of 10x leverage)
   */
  pnlPercent(pnl: bigint, margin: bigint): bigint {
    if (margin === 0n) return 0n
    return FP.div(FP.mul(pnl, FP.fromNumber(100)), margin)
  },

  /**
   * Liquidation Price — the price at which your position is force-closed.
   *
   * For LONG:
   *   liqPrice = entryPrice - (margin / size)
   *   = entryPrice × (1 - 1/leverage)
   *   At this price, your unrealized loss = your entire margin → liquidated
   *
   * For SHORT:
   *   liqPrice = entryPrice + (margin / size)
   *   = entryPrice × (1 + 1/leverage)
   *
   * Example (Long, entry $3198.45, 10x leverage):
   *   margin_per_unit = $3198.45 / 10 = $319.845
   *   liqPrice = $3198.45 - $319.845 = $2,878.61
   *   (a 10% drop wipes out a 10x leveraged long)
   *
   * In reality, exchanges add a maintenance margin buffer (e.g., 0.5%)
   * so liquidation happens slightly before margin reaches zero.
   */
  liquidationPrice(
    side: 'long' | 'short',
    entryPrice: bigint,
    leverage: bigint,
    maintenanceMarginRate: bigint = FP.fromNumber(0.005), // 0.5% default
  ): bigint {
    // marginPerUnit = entryPrice / leverage
    const marginPerUnit = FP.div(entryPrice, leverage)

    // maintenanceBuffer = entryPrice × maintenanceMarginRate
    const maintenanceBuffer = FP.mul(entryPrice, maintenanceMarginRate)

    if (side === 'long') {
      // liqPrice = entryPrice - marginPerUnit + maintenanceBuffer
      return FP.add(FP.sub(entryPrice, marginPerUnit), maintenanceBuffer)
    } else {
      // liqPrice = entryPrice + marginPerUnit - maintenanceBuffer
      return FP.sub(FP.add(entryPrice, marginPerUnit), maintenanceBuffer)
    }
  },

  /**
   * Effective Leverage = notional / equity
   * where equity = margin + unrealizedPnl
   *
   * As PnL changes, effective leverage drifts from initial leverage.
   * If PnL is negative, effective leverage increases (more risk).
   */
  effectiveLeverage(size: bigint, price: bigint, margin: bigint, pnl: bigint): bigint {
    const equity = FP.add(margin, pnl)
    if (equity <= 0n) return FP.fromNumber(999) // effectively liquidated
    const notionalVal = FP.mul(size, price)
    return FP.div(notionalVal, equity)
  },

  /**
   * Trading fee = notional × feeRate
   * Typical perp DEX: maker 0.02%, taker 0.05%
   */
  fee(size: bigint, price: bigint, feeRateBps: number): bigint {
    const notionalVal = FP.mul(size, price)
    return FP.pct(notionalVal, feeRateBps)
  },
} as const

// ---- Type for position data using BigInt throughout ----
export interface PositionBigInt {
  id: string
  market: string
  side: 'long' | 'short'
  size: bigint          // in base asset (e.g., ETH)
  entryPrice: bigint    // in quote asset (e.g., USD)
  leverage: bigint
  margin: bigint        // collateral deposited
  // Computed (derived from current mark price):
  markPrice: bigint
  unrealizedPnl: bigint
  pnlPercent: bigint
  liquidationPrice: bigint
}
