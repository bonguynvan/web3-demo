/**
 * GET /api/trades — recent trade events from indexed data.
 *
 * Query params:
 *   - token:  filter by index token address (optional, lowercased)
 *   - limit:  max results (default 50, max 200)
 */

import { Hono } from 'hono'
import { getRecentTrades } from '../db.js'
import { tokenSymbol, formatUsd } from '../config.js'
import { parsePositiveInt, parseAddress, badRequest } from '../lib/validation.js'

export const tradesRouter = new Hono()

tradesRouter.get('/', (c) => {
  const limit = parsePositiveInt(c.req.query('limit'), 50, 200)

  const tokenRaw = c.req.query('token')
  let tokenFilter: string | undefined
  if (tokenRaw) {
    const parsed = parseAddress(tokenRaw)
    if (!parsed) {
      return c.json(badRequest('Invalid token address'), 400)
    }
    tokenFilter = parsed
  }

  const rows = getRecentTrades(limit, tokenFilter)

  const trades = rows.map(row => ({
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
