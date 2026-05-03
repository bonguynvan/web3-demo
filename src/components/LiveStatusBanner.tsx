/**
 * LiveStatusBanner — green status bar when live trading is active.
 *
 * Shows when:
 *   - Vault is unlocked (so adapters can be authenticated), AND
 *   - At least one bot is in live mode (regardless of enabled state)
 *
 * Click jumps to /portfolio for the live open orders + balances.
 */

import { Link } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useVaultSessionStore } from '../store/vaultSessionStore'

export function LiveStatusBanner() {
  const unlocked = useVaultSessionStore(s => s.unlocked)
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)

  if (!unlocked) return null
  const liveBots = bots.filter(b => b.mode === 'live')
  if (liveBots.length === 0) return null

  const liveActive = liveBots.filter(b => b.enabled).length
  const liveOpenTrades = trades.filter(t => t.mode === 'live' && !t.closedAt).length

  return (
    <Link
      to="/portfolio"
      className="flex items-center gap-3 px-4 py-2 border-b border-long/30 bg-long/10 hover:bg-long/15 text-xs shrink-0 transition-colors cursor-pointer"
    >
      <Activity className="w-3.5 h-3.5 text-long shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-long">Live trading active</span>
        <span className="text-text-secondary">
          {liveActive}/{liveBots.length} bot{liveBots.length === 1 ? '' : 's'} running
          {liveOpenTrades > 0 && ` · ${liveOpenTrades} open trade${liveOpenTrades === 1 ? '' : 's'}`}
        </span>
      </div>
      <span className="shrink-0 text-[11px] text-long font-semibold uppercase tracking-wider">
        View portfolio →
      </span>
    </Link>
  )
}
