/**
 * BotsPanel — list of paper-trading bots, their stats, and recent fills.
 *
 * For Phase B1, the only config UI is a power button (toggle enabled)
 * and a delete button. Editing thresholds happens via localStorage
 * directly until the form lands in B1.1.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Bot, Trash2, Plus, BarChart3, Upload, PauseCircle, PlayCircle, Download, BookOpen, MoreVertical, Lock } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useTradingStore } from '../store/tradingStore'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { getActiveAdapter } from '../adapters/registry'
import { cn, formatUsd } from '../lib/format'
import { BotConfigForm } from './BotConfigForm'
import { BacktestModal } from './BacktestModal'
import { StrategyComparisonModal } from './StrategyComparisonModal'
import { BotImportModal } from './BotImportModal'
import { PortfolioSummary } from './PortfolioSummary'
import { BotCard } from './BotCard'
import { exportBot, copyToClipboard } from '../bots/portable'
import type { BotConfig, BotTrade } from '../bots/types'
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

export function BotsPanel() {
  const navigate = useNavigate()
  const vaultUnlocked = useVaultSessionStore(s => s.unlocked)
  const { isConnected: walletConnected } = useAccount()
  const hasConnection = vaultUnlocked || walletConnected
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const toggleBot = useBotStore(s => s.toggleBot)
  const setAllEnabled = useBotStore(s => s.setAllEnabled)
  const renameBot = useBotStore(s => s.renameBot)
  const setMode = useBotStore(s => s.setMode)
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
      // winrate — bots below 3 closed trades sink to the bottom so a
      // single-trade 100% bot does not outrank a 50-trade 80% bot.
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
  const [overflowOpen, setOverflowOpen] = useState(false)

  const handleShare = async (b: BotConfig) => {
    const ok = await copyToClipboard(exportBot(b))
    if (ok) {
      setSharedBotId(b.id)
      setTimeout(() => setSharedBotId(prev => prev === b.id ? null : prev), 1800)
    }
  }

  // Heartbeat — drives unrealized PnL display from the adapter ticker
  // cache without forcing a sub for every market.
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), STATS_TICK_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 gap-2">
        <span className="text-xs font-medium text-text-primary flex items-center gap-1.5 min-w-0">
          <Bot className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="truncate">Paper bots</span>
          <span className="text-[10px] text-text-muted shrink-0">· {bots.length}</span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {bots.length > 0 && (
            <button
              onClick={() => setAllEnabled(!anyEnabled)}
              title={anyEnabled ? 'Pause all bots' : 'Resume all bots'}
              className={cn(
                'flex items-center justify-center w-6 h-6 rounded transition-colors cursor-pointer',
                anyEnabled
                  ? 'text-text-muted hover:text-short hover:bg-short/10'
                  : 'text-long hover:bg-long/10',
              )}
            >
              {anyEnabled ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
            </button>
          )}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              title="Create new bot"
              className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-accent hover:bg-accent-dim/30 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setOverflowOpen(o => !o)}
              title="More actions"
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {overflowOpen && (
              <>
                {/* click-away */}
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setOverflowOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 z-30 w-[200px] rounded-md border border-border bg-panel shadow-lg overflow-hidden"
                >
                  {bots.length > 1 && (
                    <div className="px-3 py-2 border-b border-border">
                      <div className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-mono mb-1">Sort by</div>
                      <select
                        value={sortBy}
                        onChange={(e) => updateSort(e.target.value as BotSort)}
                        className="w-full text-[11px] bg-surface border border-border rounded px-2 py-1 text-text-primary cursor-pointer focus:outline-none focus:border-accent"
                      >
                        {SORT_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <OverflowItem
                    icon={BookOpen}
                    label="Strategy library"
                    onClick={() => { setOverflowOpen(false); navigate('/library') }}
                  />
                  <OverflowItem
                    icon={BarChart3}
                    label="Compare strategies"
                    onClick={() => { setOverflowOpen(false); setCompareOpen(true) }}
                  />
                  <OverflowItem
                    icon={Upload}
                    label="Import bot (JSON)"
                    onClick={() => { setOverflowOpen(false); setImportOpen(true) }}
                  />
                  {trades.length > 0 && (
                    <OverflowItem
                      icon={Download}
                      label="Export trades (CSV)"
                      onClick={() => { setOverflowOpen(false); exportTradesCsv(trades, bots) }}
                    />
                  )}
                  {closedCount > 0 && (
                    <OverflowItem
                      icon={Trash2}
                      label={`Clear ${closedCount} closed trade${closedCount === 1 ? '' : 's'}`}
                      tone="danger"
                      onClick={() => {
                        setOverflowOpen(false)
                        if (confirm(`Clear ${closedCount} closed trade${closedCount === 1 ? '' : 's'}? Open positions are kept.`)) {
                          clearClosedTrades()
                        }
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {!hasConnection && bots.length > 0 && (
        <div className="px-3 py-2 border-b border-border bg-amber-400/5 flex items-start gap-2 text-[11px] text-amber-400 leading-snug shrink-0">
          <Lock className="w-3 h-3 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Engine paused</div>
            <div className="text-[10px] text-text-secondary mt-0.5">
              Connect a venue to let bots execute on signals. You can still
              edit configs and run backtests.{' '}
              <Link to="/profile" className="text-accent hover:underline whitespace-nowrap">
                Connect →
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {showForm && <BotConfigForm onClose={() => setShowForm(false)} />}
        {bots.length === 0 && !showForm ? (
          <EmptyState onCreate={() => setShowForm(true)} />
        ) : (
          <>
            <PortfolioSummary bots={bots} trades={trades} />
            {sortedBots.map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                trades={trades.filter(t => t.botId === bot.id)}
                onToggle={() => toggleBot(bot.id)}
                onRename={(name) => renameBot(bot.id, name)}
                onModeChange={(mode) => setMode(bot.id, mode)}
                onRemove={() => removeBot(bot.id)}
                onBacktest={() => setBacktestBot(bot)}
                onShare={() => handleShare(bot)}
                shared={sharedBotId === bot.id}
              />
            ))}
          </>
        )}
      </div>

      <CumulativeFooter bots={bots} trades={trades} />

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

function OverflowItem({
  icon: Icon, label, onClick, tone = 'neutral',
}: {
  icon: typeof BookOpen
  label: string
  onClick: () => void
  tone?: 'neutral' | 'danger'
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 text-[11px] text-left transition-colors cursor-pointer',
        tone === 'danger'
          ? 'text-text-secondary hover:bg-short/10 hover:text-short'
          : 'text-text-secondary hover:bg-panel-light hover:text-text-primary',
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function CumulativeFooter({ bots, trades }: { bots: BotConfig[]; trades: BotTrade[] }) {
  const adapter = getActiveAdapter()
  const stats = computeStats(trades, marketId => adapter.getTicker(marketId)?.price)
  const enabled = bots.filter(b => b.enabled).length
  const pnlColor = stats.totalPnlUsd >= 0 ? 'text-long' : 'text-short'

  return (
    <div className="px-3 py-2 border-t border-border shrink-0 flex items-center justify-between gap-3 text-[10px]">
      <span className="text-text-muted">
        {enabled}/{bots.length} active · {stats.open} open · {stats.closed} closed
      </span>
      <span className={cn('font-mono tabular-nums', pnlColor)}>
        {stats.totalPnlUsd >= 0 ? '+' : ''}${formatUsd(stats.totalPnlUsd)} total
      </span>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-2">
      <Bot className="w-6 h-6 text-text-muted" />
      <span className="text-xs text-text-secondary">No bots configured</span>
      <span className="text-[10px] text-text-muted leading-relaxed max-w-[220px]">
        Bots auto-execute trades when matching signals fire. Run in paper mode
        to validate strategy before enabling live trading.
      </span>
      <div className="flex gap-2 mt-2">
        <button
          onClick={onCreate}
          className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
        >
          Create your first bot
        </button>
        <button
          onClick={() => navigate('/library')}
          className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer flex items-center gap-1"
        >
          <BookOpen className="w-3 h-3" />
          Browse library
        </button>
      </div>
    </div>
  )
}


