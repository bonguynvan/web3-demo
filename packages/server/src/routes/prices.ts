/**
 * GET /api/prices/:token — OHLC candle data from indexed price history.
 *
 * Query params:
 *   - interval: candle interval in seconds (default 300 = 5 min)
 *   - limit: max candles (default 200, max 1000)
 */

import { Hono } from 'hono'
import { getPriceHistory } from '../db.js'
import { getAddresses, PRICE_PRECISION } from '../config.js'

export const pricesRouter = new Hono()

// Map token symbol to address
function resolveToken(token: string): string | null {
  const addr = getAddresses()
  const map: Record<string, string> = {
    eth: addr.weth.toLowerCase(),
    weth: addr.weth.toLowerCase(),
    btc: addr.wbtc.toLowerCase(),
    wbtc: addr.wbtc.toLowerCase(),
  }
  return map[token.toLowerCase()] ?? null
}

function rawToNumber(raw: string): number {
  const usdc = BigInt(raw) / (PRICE_PRECISION / 10n ** 6n)
  return Number(usdc) / 1e6
}

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

pricesRouter.get('/:token', (c) => {
  const tokenParam = c.req.param('token')
  const interval = parseInt(c.req.query('interval') ?? '300', 10) // 5 min default
  const limit = Math.min(parseInt(c.req.query('limit') ?? '200', 10), 1000)

  const tokenAddr = resolveToken(tokenParam)
  if (!tokenAddr) {
    return c.json({ success: false, error: `Unknown token: ${tokenParam}` }, 400)
  }

  // Fetch raw price history (newest first)
  const rawPrices = getPriceHistory(tokenAddr, limit * 20) // oversample for aggregation
  if (rawPrices.length === 0) {
    return c.json({ success: true, data: [] })
  }

  // Reverse to oldest-first for aggregation
  const prices = rawPrices.reverse()

  // Aggregate into OHLC candles
  const candles: Candle[] = []
  let currentBucket = 0
  let candle: Candle | null = null

  for (const row of prices) {
    const price = rawToNumber(row.price)
    const bucket = Math.floor(row.timestamp / interval) * interval

    if (bucket !== currentBucket) {
      if (candle) candles.push(candle)
      candle = { time: bucket, open: price, high: price, low: price, close: price, volume: 1 }
      currentBucket = bucket
    } else if (candle) {
      candle.high = Math.max(candle.high, price)
      candle.low = Math.min(candle.low, price)
      candle.close = price
      candle.volume++
    }
  }
  if (candle) candles.push(candle)

  // Return last N candles
  const result = candles.slice(-limit)

  return c.json({ success: true, data: result })
})
