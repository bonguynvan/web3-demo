/**
 * GET /api/positions/:address — trade history + current on-chain positions.
 */

import { Hono } from 'hono'
import { getTradesByAccount } from '../db.js'
import { publicClient, getAddresses, PositionManagerABI, PriceFeedABI, tokenSymbol, formatUsd } from '../config.js'

export const positionsRouter = new Hono()

positionsRouter.get('/:address', async (c) => {
  const account = c.req.param('address').toLowerCase() as `0x${string}`
  const addresses = getAddresses()

  // Historical trades from indexed events
  const history = getTradesByAccount(account).map(row => ({
    eventType: row.event_type,
    token: tokenSymbol(row.index_token),
    isLong: row.is_long === 1,
    sizeDelta: formatUsd(BigInt(row.size_delta)),
    price: formatUsd(BigInt(row.price)),
    timestamp: row.timestamp,
    txHash: row.tx_hash,
  }))

  // Current on-chain positions
  const tokens = [
    { address: addresses.weth, symbol: 'ETH' },
    { address: addresses.wbtc, symbol: 'BTC' },
  ]

  const currentPositions: Array<{
    token: string
    isLong: boolean
    size: number
    collateral: number
    averagePrice: number
  }> = []

  for (const token of tokens) {
    for (const isLong of [true, false]) {
      try {
        const result = await publicClient.readContract({
          address: addresses.positionManager,
          abi: PositionManagerABI,
          functionName: 'getPosition',
          args: [account, token.address, isLong],
        }) as readonly [bigint, bigint, bigint, bigint, bigint]

        const [size, collateral, averagePrice] = result
        if (size > 0n) {
          currentPositions.push({
            token: token.symbol,
            isLong,
            size: formatUsd(size),
            collateral: formatUsd(collateral),
            averagePrice: formatUsd(averagePrice),
          })
        }
      } catch {
        // Position doesn't exist
      }
    }
  }

  return c.json({
    success: true,
    data: {
      current: currentPositions,
      history,
    },
  })
})
