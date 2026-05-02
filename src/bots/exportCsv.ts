/**
 * exportTradesCsv — download the bot trade ledger as a CSV file.
 *
 * Columns: openedAt, closedAt, bot, marketId, direction, entryPrice,
 * closePrice, size, positionUsd, pnlUsd, status. Timestamps emitted
 * as ISO 8601 strings.
 */

import type { BotConfig, BotTrade } from './types'

export function exportTradesCsv(trades: BotTrade[], bots: BotConfig[]): void {
  if (trades.length === 0) return
  const nameById = new Map(bots.map(b => [b.id, b.name]))
  const header = 'openedAt,closedAt,bot,marketId,direction,entryPrice,closePrice,size,positionUsd,pnlUsd,status'
  const rows = trades.map(t => [
    new Date(t.openedAt).toISOString(),
    t.closedAt ? new Date(t.closedAt).toISOString() : '',
    JSON.stringify(nameById.get(t.botId) ?? t.botId),
    t.marketId,
    t.direction,
    t.entryPrice.toFixed(8),
    t.closePrice?.toFixed(8) ?? '',
    t.size.toFixed(8),
    t.positionUsd.toFixed(2),
    t.pnlUsd?.toFixed(4) ?? '',
    t.closedAt ? 'closed' : 'open',
  ].join(','))
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.href = url
  a.download = `bot-trades-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
