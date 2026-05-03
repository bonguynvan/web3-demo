/**
 * BotManagerPage — full-page bot management surface.
 *
 * The right-rail Bots tab on /trade is intentionally compact (in-context
 * glance while charting). This page gives bots room to breathe — sticky
 * portfolio summary at top, multi-column BotCard grid, and the same
 * create/import/compare/CSV actions as the panel.
 *
 * Reuses every bot component — no logic duplicated. Adding /removing
 * bots here also reflects in the right-rail panel, since both read from
 * the same `botStore`.
 */

import { useEffect, useState } from 'react'
import { Plus, BarChart3, Upload, PauseCircle, PlayCircle, Download, Trash2 } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { getActiveAdapter } from '../adapters/registry'
import { cn } from '../lib/format'
import { BotConfigForm } from '../components/BotConfigForm'
import { BacktestModal } from '../components/BacktestModal'
import { StrategyComparisonModal } from '../components/StrategyComparisonModal'
import { BotImportModal } from '../components/BotImportModal'
import { PortfolioSummary } from '../components/PortfolioSummary'
import { BotCard } from '../components/BotCard'
import { exportBot, copyToClipboard } from '../bots/portable'
import type { BotConfig } from '../bots/types'
import { computeStats } from '../bots/computeStats'
import { exportTradesCsv } from '../bots/exportCsv'

const STATS_TICK_MS = 5_000

type BotSort = 'created' | 'pnl' | 'winrate' | 'trades'
const SORT_KEY = 'tc-bots-sort-v1'
const SORT_OPTIONS: { value: BotSort; label: string }[] = [
  { value: 'created', label: 'Newest' },
  { value: 'pnl', label: 'P&L' },
  { value: 'winrate', label: 'Win rate' },
  { value: 'trades', label: 'Trades' },
]
function loadSort(): BotSort {
  try {
    const raw = localStorage.getItem(SORT_KEY)
    if (raw === 'pnl' || raw === 'winrate' || raw === 'trades' || raw === 'created') return raw
    return 'created'
  } catch { return 'created' }
}

export function BotManagerPage() {
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const toggleBot = useBotStore(s => s.toggleBot)
  const setAllEnabled = useBotStore(s => s.setAllEnabled)
  const renameBot = useBotStore(s => s.renameBot)
  const removeBot = useBotStore(s => s.removeBot)
  const clearClosedTrades = useBotStore(s => s.clearClosedTrades)
  const closedCount = trades.filter(t => t.closedAt !== undefined).length
  const anyEnabled = bots.some(b => b.enabled)

  const [sortBy, setSortBy] = useState<BotSort>(() => loadSort())
  const updateSort = (next: BotSort) => {
    setSortBy(next)
    try { localStorage.setItem(SORT_KEY, next) } catch { /* full */ }
  }
  const sortedBots = (() => {
    if (sortBy === 'created') return [...bots].sort((a, b) => b.createdAt - a.createdAt)
    const adapter = getActiveAdapter()
    const statFor = (b: BotConfig) => computeStats(
      trades.filter(t => t.botId === b.id),
      marketId => adapter.getTicker(marketId)?.price,
    )
    return [...bots].sort((a, b) => {
      const sa = statFor(a)
      const sb = statFor(b)
      if (sortBy === 'pnl') return sb.totalPnlUsd - sa.totalPnlUsd
      if (sortBy === 'trades') return sb.total - sa.total
      const aQual = sa.closed >= 3
      const bQual = sb.closed >= 3
      if (aQual !== bQual) return aQual ? -1 : 1
      if (sb.winRate !== sa.winRate) return sb.winRate - sa.winRate
      return sb.closed - sa.closed
    })
  })()

  const [, force] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [backtestBot, setBacktestBot] = useState<BotConfig | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [sharedBotId, setSharedBotId] = useState<string | null>(null)

  const handleShare = async (b: BotConfig) => {
    const ok = await copyToClipboard(exportBot(b))
    if (ok) {
      setSharedBotId(b.id)
      setTimeout(() => setSharedBotId(prev => prev === b.id ? null : prev), 1800)
    }
  }

  // Heartbeat for live unrealized PnL.
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), STATS_TICK_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-6">
        <header className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Bot manager</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Configure, monitor, and tune all your paper-trading bots.
              The right-rail panel on /trade is the at-a-glance view; this page is the workshop.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted">{bots.length} configured</span>
            {bots.length > 1 && (
              <select
                value={sortBy}
                onChange={(e) => updateSort(e.target.value as BotSort)}
                title="Sort bots (win rate requires ≥3 closed trades)"
                className="text-[11px] bg-surface border border-border rounded px-1.5 py-1 text-text-secondary cursor-pointer focus:outline-none focus:border-accent"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
            {bots.length > 0 && (
              <button
                onClick={() => setAllEnabled(!anyEnabled)}
                title={anyEnabled ? 'Pause all bots' : 'Resume all bots'}
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer',
                  anyEnabled
                    ? 'text-text-muted hover:text-short hover:bg-short/10'
                    : 'text-long hover:bg-long/10',
                )}
              >
                {anyEnabled ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => setCompareOpen(true)}
              title="Compare strategies side-by-side"
              className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-accent hover:bg-accent-dim/30 transition-colors cursor-pointer"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            {trades.length > 0 && (
              <button
                onClick={() => exportTradesCsv(trades, bots)}
                title="Export trades as CSV"
                className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-accent hover:bg-accent-dim/30 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            {closedCount > 0 && (
              <button
                onClick={() => {
                  if (confirm(`Clear ${closedCount} closed trade${closedCount === 1 ? '' : 's'}? Open positions are kept.`)) {
                    clearClosedTrades()
                  }
                }}
                title="Clear closed trades from ledger"
                className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-short hover:bg-short/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setImportOpen(true)}
              title="Import bot from JSON"
              className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-accent hover:bg-accent-dim/30 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowForm(s => !s)}
              title={showForm ? 'Cancel' : 'Create new bot'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {showForm ? 'Cancel' : 'New bot'}
            </button>
          </div>
        </header>

        {showForm && (
          <div className="mb-6 bg-panel border border-border rounded-lg overflow-hidden">
            <BotConfigForm onClose={() => setShowForm(false)} />
          </div>
        )}

        {bots.length > 0 && (
          <div className="mb-6 bg-panel border border-border rounded-lg overflow-hidden">
            <PortfolioSummary bots={bots} trades={trades} />
          </div>
        )}

        {bots.length === 0 ? (
          <div className="bg-panel/40 border border-border rounded-lg p-10 text-center">
            <div className="text-sm text-text-secondary mb-2">No bots yet</div>
            <div className="text-xs text-text-muted mb-4 max-w-md mx-auto leading-relaxed">
              Create your first bot, import one from a colleague's JSON, or browse the curated
              strategy library.
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setShowForm(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 cursor-pointer"
              >
                New bot
              </button>
              <button
                onClick={() => setImportOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light cursor-pointer"
              >
                Import JSON
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sortedBots.map(bot => (
              <div key={bot.id} className="bg-panel border border-border rounded-lg overflow-hidden">
                <BotCard
                  bot={bot}
                  trades={trades.filter(t => t.botId === bot.id)}
                  onToggle={() => toggleBot(bot.id)}
                  onRename={(name) => renameBot(bot.id, name)}
                  onRemove={() => removeBot(bot.id)}
                  onBacktest={() => setBacktestBot(bot)}
                  onShare={() => handleShare(bot)}
                  shared={sharedBotId === bot.id}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {backtestBot && (
        <BacktestModal
          open={!!backtestBot}
          onClose={() => setBacktestBot(null)}
          bot={backtestBot}
        />
      )}
      <StrategyComparisonModal open={compareOpen} onClose={() => setCompareOpen(false)} />
      <BotImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
