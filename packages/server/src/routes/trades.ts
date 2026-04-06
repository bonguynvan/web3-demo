/**
 * GET /api/trades — recent trade events from indexed data.
 *
 * Query params:
 *   - token: filter by index token address (optional)
 *   - limit: max results (default 50, max 200)
 */

import { Hono } from 'hono'
import { getRecentTrades } from '../db.js'
import { tokenSymbol, formatUsd, PRICE_PRECISION } from '../config.js'

export const tradesRouter = new Hono()

tradesRouter.get('/', (c) => {
  const token = c.req.query('token')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200)

  const rows = getRecentTrades(limit, token || undefined)

  const trades = rows.map((row, i) => ({
    id: `${row.tx_hash}-${row.log_index}`,
    blockNumber: row.block_number,
    txHash: row.tx_hash,
    eventType: row.event_type,
    account: row.account,
    token: tokenSymbol(row.index_token),
    indexToken: row.index_token,
    isLong: row.is_long === 1,
    sizeDelta: formatUsd(BigInt(row.size_delta)),
    collateralDelta: formatUsd(BigInt(row.collateral_delta)),
    price: formatUsd(BigInt(row.price)),
    fee: formatUsd(BigInt(row.fee)),
    timestamp: row.timestamp,
  }))

  return c.json({ success: true, data: trades })
})
