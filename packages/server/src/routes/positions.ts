/**
 * GET /api/positions/:address — trade history + current on-chain positions.
 *
 * Path:
 *   - address: EVM address (validated 0x[40 hex])
 */

import { Hono } from 'hono'
import { getTradesByAccount } from '../db.js'
import {
  publicClient,
  getAddresses,
  PositionManagerABI,
  tokenSymbol,
  formatUsd,
} from '../config.js'
import { parseAddress, badRequest } from '../lib/validation.js'

export const positionsRouter = new Hono()

positionsRouter.get('/:address', async (c) => {
  const account = parseAddress(c.req.param('address'))
  if (!account) {
    return c.json(badRequest('Invalid account address'), 400)
  }

  const addresses = getAddresses()

  // Historical fills from indexed events
  const history = getTradesByAccount(account).map(row => ({
    eventType: row.event_type,
    token: tokenSymbol(row.index_token),
    isLong: row.is_long === 1,
    sizeDelta: formatUsd(BigInt(row.size_delta)),
    collateralDelta: formatUsd(BigInt(row.collateral_delta)),
    price: formatUsd(BigInt(row.price)),
    fee: formatUsd(BigInt(row.fee)),
    // USDC paid back to receiver on close — used by frontend to compute
    // realised PnL as (usdcOut - collateralDelta - fee). 0 for opens/liqs.
    usdcOut: formatUsd(BigInt(row.usdc_out)),
    timestamp: row.timestamp,
    txHash: row.tx_hash,
  }))

  // Current positions read directly from the contract (4 slots: ETH/BTC × long/short)
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
        const result = (await publicClient.readContract({
          address: addresses.positionManager,
          abi: PositionManagerABI,
          functionName: 'getPosition',
          args: [account, token.address, isLong],
        })) as readonly [bigint, bigint, bigint, bigint, bigint]

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
      } catch (err: unknown) {
        // A reverting getPosition is normal (slot empty); only log unexpected errors.
        if (err instanceof Error && !/revert/i.test(err.message)) {
          console.error(`[positions] getPosition ${token.symbol} long=${isLong} failed:`, err.message)
        }
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
