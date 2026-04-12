import { describe, it, expect, beforeEach } from 'vitest'
import {
  computeExpiryTimestamp,
  computeBasisRate,
  addFuturesPosition,
  getFuturesPositions,
  getUnsettledExpired,
  settleFuturesPosition,
  closeFuturesPosition,
  getFuturesHistory,
  resetFuturesState,
  TENOR_DURATIONS,
} from './futuresData'

// Reset all futures state between tests
beforeEach(() => {
  resetFuturesState()
})

describe('computeExpiryTimestamp', () => {
  it('returns a timestamp in the future', () => {
    const now = Date.now()
    const expiry = computeExpiryTimestamp('1W')
    expect(expiry).toBeGreaterThan(now)
    expect(expiry - now).toBeCloseTo(TENOR_DURATIONS['1W'], -2)
  })

  it('3M expiry is longer than 1W', () => {
    const w1 = computeExpiryTimestamp('1W')
    const m3 = computeExpiryTimestamp('3M')
    expect(m3).toBeGreaterThan(w1)
  })
})

describe('computeBasisRate', () => {
  it('returns positive basis and annualized rate', () => {
    const { basis, annualized } = computeBasisRate('1M')
    expect(annualized).toBeGreaterThan(0)
    expect(basis).toBeGreaterThan(0)
    expect(basis).toBeLessThan(annualized)
  })

  it('shorter tenors have higher annualized rates', () => {
    // Run multiple times and average to account for random noise
    let sum1W = 0, sum3M = 0
    for (let i = 0; i < 100; i++) {
      sum1W += computeBasisRate('1W').annualized
      sum3M += computeBasisRate('3M').annualized
    }
    expect(sum1W / 100).toBeGreaterThan(sum3M / 100)
  })
})

describe('addFuturesPosition', () => {
  it('creates a position with correct fields', () => {
    const result = addFuturesPosition({
      market: 'ETH-PERP',
      baseAsset: 'ETH',
      side: 'long',
      collateral: 1000,
      leverage: 5,
      entryPrice: 3500,
      tenor: '1M',
    })

    expect(result.effectiveEntry).toBeGreaterThan(3500) // spread added for longs
    expect(result.openFee).toBeGreaterThan(0)
    expect(result.expiryTimestamp).toBeGreaterThan(Date.now())
  })

  it('short positions have entry below market', () => {
    const result = addFuturesPosition({
      market: 'ETH-PERP',
      baseAsset: 'ETH',
      side: 'short',
      collateral: 1000,
      leverage: 5,
      entryPrice: 3500,
      tenor: '1W',
    })

    expect(result.effectiveEntry).toBeLessThan(3500)
  })
})

describe('getFuturesPositions', () => {
  it('recalculates PnL from prices', () => {
    addFuturesPosition({
      market: 'ETH-PERP',
      baseAsset: 'ETH',
      side: 'long',
      collateral: 1000,
      leverage: 5,
      entryPrice: 3500,
      tenor: '1M',
    })

    const positions = getFuturesPositions(() => 3600)
    expect(positions).toHaveLength(1)
    expect(positions[0].pnl).toBeGreaterThan(0) // price went up, long is profitable
  })
})

describe('settlement', () => {
  it('settles position at given price', () => {
    addFuturesPosition({
      market: 'ETH-PERP',
      baseAsset: 'ETH',
      side: 'long',
      collateral: 1000,
      leverage: 5,
      entryPrice: 3500,
      tenor: '1M',
    })

    const positions = getFuturesPositions(() => 3500)
    const result = settleFuturesPosition(positions[0].id, 3600)

    expect(result).not.toBeNull()
    expect(result!.settlementPrice).toBe(3600)
    expect(result!.pnl).toBeGreaterThan(0) // price up, long profitable
  })

  it('does not settle at price 0', () => {
    addFuturesPosition({
      market: 'ETH-PERP',
      baseAsset: 'ETH',
      side: 'long',
      collateral: 1000,
      leverage: 5,
      entryPrice: 3500,
      tenor: '1M',
    })

    const positions = getFuturesPositions(() => 3500)
    const result = settleFuturesPosition(positions[0].id, 0)
    expect(result).toBeNull()
  })

  it('records settlement in history', () => {
    addFuturesPosition({
      market: 'ETH-PERP',
      baseAsset: 'ETH',
      side: 'short',
      collateral: 500,
      leverage: 10,
      entryPrice: 3500,
      tenor: '2W',
    })

    const positions = getFuturesPositions(() => 3500)
    settleFuturesPosition(positions[0].id, 3400)

    const history = getFuturesHistory()
    expect(history).toHaveLength(1)
    expect(history[0].side).toBe('short')
    expect(history[0].pnl).toBeGreaterThan(0) // price dropped, short wins
  })

  it('closeFuturesPosition works the same as settlement', () => {
    addFuturesPosition({
      market: 'BTC-PERP',
      baseAsset: 'BTC',
      side: 'long',
      collateral: 2000,
      leverage: 3,
      entryPrice: 65000,
      tenor: '3M',
    })

    const positions = getFuturesPositions(() => 65000)
    const result = closeFuturesPosition(positions[0].id, 66000)
    expect(result).not.toBeNull()
    expect(result!.settlementPrice).toBe(66000)
  })
})
