/**
 * computeStats — derive aggregate BotStats from a trade ledger.
 *
 * Pure function. Closed trades contribute realized PnL; open trades
 * contribute unrealized PnL via a caller-provided mark-price getter.
 */

import type { BotStats, BotTrade } from './types'

export function computeStats(
  trades: BotTrade[],
  getMark: (id: string) => number | undefined,
): BotStats {
  let realizedPnl = 0
  let unrealizedPnl = 0
  let wins = 0
  let losses = 0
  let open = 0
  let closed = 0

  for (const t of trades) {
    if (t.closedAt && t.pnlUsd !== undefined) {
      closed++
      realizedPnl += t.pnlUsd
      if (t.pnlUsd >= 0) wins++
      else losses++
    } else {
      open++
      const mark = getMark(t.marketId) ?? t.entryPrice
      const sign = t.direction === 'long' ? 1 : -1
      unrealizedPnl += sign * (mark - t.entryPrice) * t.size
    }
  }

  return {
    total: trades.length,
    open,
    closed,
    wins,
    losses,
    winRate: closed > 0 ? wins / closed : 0,
    totalPnlUsd: realizedPnl + unrealizedPnl,
    realizedPnlUsd: realizedPnl,
    unrealizedPnlUsd: unrealizedPnl,
  }
}
