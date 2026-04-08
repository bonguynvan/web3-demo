/**
 * GET /api/prices/:token — OHLC candle data from indexed price snapshots.
 *
 * Path:
 *   - token: short symbol (eth | weth | btc | wbtc)
 *
 * Query params:
 *   - interval: candle interval in seconds (default 300 = 5 min, max 86400)
 *   - limit: max candles (default 200, max 1000)
 *
 * NOTE: This aggregates oracle price snapshots, not trades. For true trade-
 * volume candles use /api/markets/:symbol/candles.
 */

import { Hono } from 'hono'
import { getPriceHistory } from '../db.js'
import { getAddresses, PRICE_PRECISION } from '../config.js'
import { parsePositiveInt, parseEnum, badRequest } from '../lib/validation.js'

export const pricesRouter = new Hono()

const TOKEN_KEYS = ['eth', 'weth', 'btc', 'wbtc'] as const
type TokenKey = typeof TOKEN_KEYS[number]

function resolveToken(token: TokenKey): string {
  const addr = getAddresses()
  switch (token) {
    case 'eth':
    case 'weth':
      return addr.weth.toLowerCase()
    case 'btc':
    case 'wbtc':
      return addr.wbtc.toLowerCase()
  }
}

const USDC_DENOM = PRICE_PRECISION / 10n ** 6n

function rawToNumber(raw: string): number {
  return Number(BigInt(raw) / USDC_DENOM) / 1e6
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
  const tokenParam = parseEnum(c.req.param('token').toLowerCase(), TOKEN_KEYS)
  if (!tokenParam) {
    return c.json(badRequest(`Unknown token. Use one of: ${TOKEN_KEYS.join(', ')}`), 400)
  }

  const interval = parsePositiveInt(c.req.query('interval'), 300, 86_400)
  const limit = parsePositiveInt(c.req.query('limit'), 200, 1000)

  const tokenAddr = resolveToken(tokenParam)
  const rawPrices = getPriceHistory(tokenAddr, limit * 20) // oversample for aggregation
  if (rawPrices.length === 0) {
    return c.json({ success: true, data: [] })
  }

  // Reverse to oldest-first for sequential bucketing.
  const prices = rawPrices.slice().reverse()

  const candles: Candle[] = []
  let candle: Candle | null = null

  for (const row of prices) {
    const price = rawToNumber(row.price)
    const bucket = Math.floor(row.timestamp / interval) * interval

    if (!candle || candle.time !== bucket) {
      if (candle) candles.push(candle)
      candle = { time: bucket, open: price, high: price, low: price, close: price, volume: 1 }
    } else {
      candle.high = Math.max(candle.high, price)
      candle.low = Math.min(candle.low, price)
      candle.close = price
      candle.volume++
    }
  }
  if (candle) candles.push(candle)

  return c.json({ success: true, data: candles.slice(-limit) })
})
