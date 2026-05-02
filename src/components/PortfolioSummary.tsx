/**
 * PortfolioSummary — sticky top block in BotsPanel showing aggregate
 * stats across all bots: total PnL, win rate, equity curve, realized
 * vs unrealized, risk metrics, and best/worst bot.
 *
 * Pure presentational. Pulls live mark prices from the active venue
 * adapter for unrealized PnL — venue-agnostic.
 */

import { getActiveAdapter } from '../adapters/registry'
import type { BotConfig, BotTrade } from '../bots/types'
import { computeStats } from '../bots/computeStats'
import { EquityCurve } from './EquityCurve'
import { cn, formatUsd } from '../lib/format'

export function PortfolioSummary({ bots, trades }: { bots: BotConfig[]; trades: BotTrade[] }) {
  const adapter = getActiveAdapter()
  const stats = computeStats(trades, marketId => adapter.getTicker(marketId)?.price)
  const closedSorted = trades
    .filter((t): t is BotTrade & { closedAt: number; pnlUsd: number } =>
      t.closedAt !== undefined && t.pnlUsd !== undefined)
    .sort((a, b) => a.closedAt - b.closedAt)

  let best: { name: string; pnl: number } | null = null
  let worst: { name: string; pnl: number } | null = null
  for (const bot of bots) {
    const botStats = computeStats(
      trades.filter(t => t.botId === bot.id),
      marketId => adapter.getTicker(marketId)?.price,
    )
    if (best === null || botStats.totalPnlUsd > best.pnl) {
      best = { name: bot.name, pnl: botStats.totalPnlUsd }
    }
    if (worst === null || botStats.totalPnlUsd < worst.pnl) {
      worst = { name: bot.name, pnl: botStats.totalPnlUsd }
    }
  }

  const pnlColor = stats.totalPnlUsd >= 0 ? 'text-long' : 'text-short'
  const realizedColor = stats.realizedPnlUsd >= 0 ? 'text-long' : 'text-short'
  const unrealizedColor = stats.unrealizedPnlUsd >= 0 ? 'text-long' : 'text-short'
  const enabledCount = bots.filter(b => b.enabled).length

  return (
    <div className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur px-3 py-3">
      <div className="flex items-end justify-between mb-2">
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider">Portfolio P&L</div>
          <div className={cn('text-2xl font-mono font-bold tabular-nums', pnlColor)}>
            {stats.totalPnlUsd >= 0 ? '+' : ''}${formatUsd(stats.totalPnlUsd)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-text-muted uppercase tracking-wider">Win rate</div>
          <div className="text-lg font-mono text-text-primary tabular-nums">
            {stats.closed > 0 ? `${Math.round(stats.winRate * 100)}%` : '—'}
          </div>
        </div>
      </div>

      {closedSorted.length >= 2 && (
        <EquityCurve trades={closedSorted} className="mb-3" />
      )}

      <div className="grid grid-cols-4 gap-1.5 mb-3">
        <SmallStat
          label="Realized"
          value={`${stats.realizedPnlUsd >= 0 ? '+' : ''}$${formatUsd(stats.realizedPnlUsd)}`}
          valueClass={realizedColor}
        />
        <SmallStat
          label="Unrealized"
          value={`${stats.unrealizedPnlUsd >= 0 ? '+' : ''}$${formatUsd(stats.unrealizedPnlUsd)}`}
          valueClass={unrealizedColor}
        />
        <SmallStat label="Open" value={`${stats.open}`} />
        <SmallStat label="Closed" value={`${stats.closed}`} />
      </div>

      {closedSorted.length >= 3 && (() => {
        let cum = 0
        let peak = 0
        let maxDrawdown = 0
        let grossProfit = 0
        let grossLoss = 0
        let curStreak = 0
        let worstStreak = 0
        for (const t of closedSorted) {
          cum += t.pnlUsd
          if (cum > peak) peak = cum
          const dd = peak - cum
          if (dd > maxDrawdown) maxDrawdown = dd
          if (t.pnlUsd >= 0) {
            grossProfit += t.pnlUsd
            curStreak = 0
          } else {
            grossLoss += -t.pnlUsd
            curStreak += 1
            if (curStreak > worstStreak) worstStreak = curStreak
          }
        }
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
        return (
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            <SmallStat
              label="Max DD"
              value={maxDrawdown > 0 ? `−$${formatUsd(maxDrawdown)}` : '—'}
              valueClass={maxDrawdown > 0 ? 'text-short' : undefined}
            />
            <SmallStat
              label="Profit factor"
              value={
                profitFactor === Infinity
                  ? '∞'
                  : profitFactor > 0
                    ? profitFactor.toFixed(2)
                    : '—'
              }
              valueClass={profitFactor >= 1.5 ? 'text-long' : profitFactor < 1 && profitFactor > 0 ? 'text-short' : undefined}
            />
            <SmallStat
              label="Worst losing streak"
              value={worstStreak > 0 ? `${worstStreak}` : '—'}
              valueClass={worstStreak >= 5 ? 'text-short' : undefined}
            />
          </div>
        )
      })()}

      {(best || worst) && best?.name !== worst?.name && (
        <div className="flex items-center gap-2 text-[10px]">
          {best && (
            <div className="flex-1 bg-surface/50 rounded px-2 py-1 border border-border/60">
              <div className="text-text-muted">Top bot</div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-text-primary font-medium truncate">{best.name}</span>
                <span className={cn('font-mono', best.pnl >= 0 ? 'text-long' : 'text-short')}>
                  {best.pnl >= 0 ? '+' : ''}${formatUsd(best.pnl)}
                </span>
              </div>
            </div>
          )}
          {worst && (
            <div className="flex-1 bg-surface/50 rounded px-2 py-1 border border-border/60">
              <div className="text-text-muted">Worst</div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-text-primary font-medium truncate">{worst.name}</span>
                <span className={cn('font-mono', worst.pnl >= 0 ? 'text-long' : 'text-short')}>
                  {worst.pnl >= 0 ? '+' : ''}${formatUsd(worst.pnl)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-[10px] text-text-muted mt-2">
        {bots.length} bot{bots.length === 1 ? '' : 's'} · {enabledCount} active
      </div>
    </div>
  )
}

function SmallStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-surface/50 rounded px-2 py-1 border border-border/60">
      <div className="text-[9px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className={cn('text-[11px] font-mono mt-0.5 tabular-nums truncate', valueClass ?? 'text-text-primary')}>
        {value}
      </div>
    </div>
  )
}
