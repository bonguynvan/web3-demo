/**
 * Market metadata + 24h stats + true OHLCV candles from trade events.
 *
 * Routes:
 *   GET /api/markets
 *   GET /api/markets/:symbol/stats
 *   GET /api/markets/:symbol/candles?timeframe=1m&from=&to=&limit=
 */

import { Hono } from 'hono'
import { getMarkets, marketBySymbol, formatUsd } from '../config.js'
import { get24hStats, getTradesForCandles } from '../db.js'
import { parsePositiveInt, parseEnum, parseUnixTimestamp, badRequest } from '../lib/validation.js'

export const marketsRouter = new Hono()

// ─── GET /api/markets ───────────────────────────────────────────────────────

marketsRouter.get('/', (c) => {
  const markets = getMarkets().map(m => ({
    symbol: m.symbol,
    baseAsset: m.baseAsset,
    indexToken: m.indexToken,
  }))
  return c.json({ success: true, data: markets })
})

// ─── GET /api/markets/:symbol/stats ─────────────────────────────────────────

marketsRouter.get('/:symbol/stats', (c) => {
  const market = marketBySymbol(c.req.param('symbol'))
  if (!market) {
    return c.json(badRequest('Unknown market'), 404)
  }

  const stats = get24hStats(market.indexToken.toLowerCase())

  const latestPrice = stats.latestPriceRaw ? formatUsd(BigInt(stats.latestPriceRaw)) : 0
  const openPrice = stats.priceOpen24hRaw ? formatUsd(BigInt(stats.priceOpen24hRaw)) : 0
  const high = stats.high24hRaw ? formatUsd(BigInt(stats.high24hRaw)) : 0
  const low = stats.low24hRaw ? formatUsd(BigInt(stats.low24hRaw)) : 0
  const change24hUsd = openPrice > 0 ? latestPrice - openPrice : 0
  const change24h = openPrice > 0 ? (change24hUsd / openPrice) * 100 : 0

  return c.json({
    success: true,
    data: {
      symbol: market.symbol,
      baseAsset: market.baseAsset,
      indexToken: market.indexToken,
      price: latestPrice,
      priceTime: stats.latestPriceTime,
      change24h,
      change24hUsd,
      high24h: high,
      low24h: low,
      volume24h: formatUsd(BigInt(stats.volume24hRaw)),
      trades24h: stats.trades24h,
      // Funding/OI are intentionally omitted — the contracts don't expose
      // a funding accumulator yet (Phase 2 of the contract roadmap), and
      // computing OI requires a long/short snapshot table that doesn't
      // exist yet.
    },
  })
})

// ─── GET /api/markets/:symbol/candles ───────────────────────────────────────

const TIMEFRAMES: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14_400,
  '1d': 86_400,
}
const TIMEFRAME_KEYS = Object.keys(TIMEFRAMES) as (keyof typeof TIMEFRAMES)[]

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

marketsRouter.get('/:symbol/candles', (c) => {
  const market = marketBySymbol(c.req.param('symbol'))
  if (!market) {
    return c.json(badRequest('Unknown market'), 404)
  }

  const tf = parseEnum(c.req.query('timeframe') ?? '5m', TIMEFRAME_KEYS)
  if (!tf) {
    return c.json(
      badRequest(`Invalid timeframe. Use one of: ${TIMEFRAME_KEYS.join(', ')}`),
      400,
    )
  }
  const intervalSec = TIMEFRAMES[tf]
  const limit = parsePositiveInt(c.req.query('limit'), 200, 1000)

  const now = Math.floor(Date.now() / 1000)
  const explicitFrom = parseUnixTimestamp(c.req.query('from'))
  const explicitTo = parseUnixTimestamp(c.req.query('to'))
  const to = explicitTo ?? now
  // Default lookback covers `limit` buckets so the response is non-empty
  // when the client doesn't specify a range.
  const from = explicitFrom ?? to - intervalSec * limit

  if (from > to) {
    return c.json(badRequest('`from` must be ≤ `to`'), 400)
  }

  const fills = getTradesForCandles(market.indexToken.toLowerCase(), from, to)
  if (fills.length === 0) {
    return c.json({ success: true, data: [] })
  }

  // Bucket trades into OHLCV candles. Volume sums |size_delta| converted to
  // dollars (close approximation: notional moved through this market).
  const candles: Candle[] = []
  let current: Candle | null = null

  for (const fill of fills) {
    const price = formatUsd(BigInt(fill.price))
    if (price <= 0) continue
    const sizeUsd = formatUsd(BigInt(fill.size_delta))
    const bucket = Math.floor(fill.timestamp / intervalSec) * intervalSec

    if (!current || current.time !== bucket) {
      if (current) candles.push(current)
      current = {
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: sizeUsd,
      }
    } else {
      current.high = Math.max(current.high, price)
      current.low = Math.min(current.low, price)
      current.close = price
      current.volume += sizeUsd
    }
  }
  if (current) candles.push(current)

  return c.json({
    success: true,
    data: candles.slice(-limit),
    meta: {
      timeframe: tf,
      from,
      to,
      bucketCount: candles.length,
    },
  })
})
