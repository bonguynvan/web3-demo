/**
 * Quick sanity tests for FixedPoint18 math.
 * Run: npx tsx src/lib/fixedPoint.test.ts
 *
 * These prove that BigInt math avoids the floating-point errors
 * that would cause wrong PnL / liquidation prices in production.
 */

import { FP } from './fixedPoint'

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`FAIL: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

function _approxEq(a: bigint, b: bigint, toleranceBps: number = 1) {
  // Allow tolerance of N basis points (1 bps = 0.01%)
  const diff = FP.abs(FP.sub(a, b))
  const threshold = FP.pct(FP.abs(a), toleranceBps)
  return diff <= threshold
}

console.log('\n=== FixedPoint18 Tests ===\n')

// ---- Conversion tests ----
console.log('Conversions:')
{
  const one = FP.fromNumber(1)
  assert(one === FP.WAD, 'fromNumber(1) === 1e18')

  const point1 = FP.fromNumber(0.1)
  assert(point1 === 100_000_000_000_000_000n, 'fromNumber(0.1) === 1e17')

  const fromStr = FP.fromString('3245.67')
  const fromNum = FP.fromNumber(3245.67)
  assert(fromStr === fromNum, 'fromString matches fromNumber')

  const back = FP.toNumber(FP.fromNumber(3245.67), 2)
  assert(back === 3245.67, `toNumber roundtrip: ${back} === 3245.67`)
}

// ---- Arithmetic tests ----
console.log('\nArithmetic:')
{
  // The classic floating point failure: 0.1 + 0.2
  const a = FP.fromNumber(0.1)
  const b = FP.fromNumber(0.2)
  const sum = FP.add(a, b)
  const expected = FP.fromNumber(0.3)
  assert(sum === expected, `0.1 + 0.2 = 0.3 exactly (not 0.30000000000000004)`)

  // Multiplication
  const price = FP.fromNumber(3245.67)
  const size = FP.fromNumber(5.2)
  const notional = FP.mul(price, size)
  const notionalDisplay = FP.toNumber(notional, 2)
  assert(Math.abs(notionalDisplay - 16877.48) < 0.02, `5.2 × $3245.67 ≈ $${notionalDisplay}`)

  // Division
  const leverage = FP.fromNumber(10)
  const margin = FP.div(notional, leverage)
  const marginDisplay = FP.toNumber(margin, 2)
  assert(Math.abs(marginDisplay - 1687.75) < 0.02, `margin at 10x = $${marginDisplay}`)
}

// ---- Trading calculation tests ----
console.log('\nTrading Calculations:')
{
  const entryPrice = FP.fromNumber(3198.45)
  const markPrice = FP.fromNumber(3245.89)
  const size = FP.fromNumber(5.2)
  const leverage = FP.fromNumber(10)

  // PnL for a long position
  const pnl = FP.unrealizedPnl('long', size, entryPrice, markPrice)
  const pnlDisplay = FP.toNumber(pnl, 2)
  assert(Math.abs(pnlDisplay - 246.69) < 0.1, `Long PnL: $${pnlDisplay} ≈ $246.69`)

  // PnL should be negative for wrong direction
  const pnlShort = FP.unrealizedPnl('short', size, entryPrice, markPrice)
  assert(FP.isNeg(pnlShort), `Short PnL is negative when price goes up: $${FP.toNumber(pnlShort, 2)}`)

  // Liquidation price for long
  const liqPrice = FP.liquidationPrice('long', entryPrice, leverage)
  const liqDisplay = FP.toNumber(liqPrice, 2)
  // With 10x leverage and 0.5% maintenance: liq ≈ entry × (1 - 1/10 + 0.005) = entry × 0.905
  const expectedLiq = 3198.45 * 0.905
  assert(Math.abs(liqDisplay - expectedLiq) < 2, `Long liq price: $${liqDisplay} ≈ $${expectedLiq.toFixed(2)}`)

  // Liquidation price for short should be ABOVE entry
  const liqShort = FP.liquidationPrice('short', entryPrice, leverage)
  assert(liqShort > entryPrice, `Short liq price > entry: $${FP.toNumber(liqShort, 2)} > $3198.45`)

  // Fee calculation (5 bps = 0.05%)
  const fee = FP.fee(size, entryPrice, 5)
  const feeDisplay = FP.toNumber(fee, 2)
  const expectedFee = 5.2 * 3198.45 * 0.0005
  assert(Math.abs(feeDisplay - expectedFee) < 0.05, `Fee (5bps): $${feeDisplay} ≈ $${expectedFee.toFixed(2)}`)
}

// ---- Edge case: large numbers (whale position) ----
console.log('\nEdge Cases:')
{
  // 10,000 BTC at $84,521 = $845,210,000 notional
  const btcPrice = FP.fromNumber(84521)
  const btcSize = FP.fromNumber(10000)
  const notional = FP.mul(btcPrice, btcSize)
  const display = FP.toNumber(notional, 0)
  assert(display === 845210000, `Whale position: $${display.toLocaleString()}`)

  // This would overflow Number.MAX_SAFE_INTEGER in normal JS
  // But BigInt handles it perfectly
  assert(notional > BigInt(Number.MAX_SAFE_INTEGER), 'BigInt handles values > MAX_SAFE_INTEGER')
}

console.log('\n=== All tests passed ===\n')
