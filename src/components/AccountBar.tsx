/**
 * AccountBar — always-visible account summary strip.
 *
 * Reads from two real, live sources:
 *   - useVenueBalances() — signed REST account snapshot when a vault is
 *     unlocked. Today this surfaces Binance USDT free balance.
 *   - useBotStore.trades — paper + live bot positions; open trades feed
 *     unrealized PnL (priced against the active adapter's live ticker).
 *
 * If nothing is connected, the bar collapses to a single "connect" CTA
 * pointing at /profile. The previous behavior was to render demo numbers
 * via the long-removed `useIsDemo()` flag, which made the workstation
 * feel fake even when the user had bots running.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Wallet, ExternalLink } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useVenueBalances } from '../hooks/useVenueBalances'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { useRiskStore } from '../store/riskStore'
import { getActiveAdapter } from '../adapters/registry'
import { cn, formatUsd } from '../lib/format'
import { FlashPrice } from './ui/FlashPrice'
import { Tooltip } from './ui/Tooltip'
import type { VenueId } from '../adapters/types'

const TICK_MS = 2_000

export function AccountBar() {
  const { t } = useTranslation('perp')
  const trades = useBotStore(s => s.trades)
  const vaultUnlocked = useVaultSessionStore(s => s.unlocked)
  const { states: venueBalances } = useVenueBalances()

  // Heartbeat — re-render every 2s so unrealized PnL on open positions
  // tracks the live ticker without each row needing its own subscription.
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const maxExposureUsd = useRiskStore(s => s.maxExposureUsd)
  const venueSnapshot = useMemo(() => summariseVenues(venueBalances), [venueBalances])
  const botSnapshot = useMemo(() => summariseBots(trades), [trades])
  const exposurePct = maxExposureUsd > 0 ? Math.min(100, (botSnapshot.notionalOpen / maxExposureUsd) * 100) : 0
  const exposureTone = exposurePct >= 90 ? 'short' : exposurePct >= 70 ? 'amber' : 'long'

  const totalEquity = venueSnapshot.usdtFree + botSnapshot.notionalOpen + botSnapshot.unrealized
  const hasConnection = vaultUnlocked && venueSnapshot.usdtFree > 0
  const hasBots = trades.length > 0

  if (!hasConnection && !hasBots) {
    return (
      <div className="flex items-center h-8 bg-panel/80 border-b border-border px-3 md:px-4 gap-3 text-[11px] shrink-0">
        <span className="flex items-center gap-1.5 text-text-secondary">
          <Wallet className="w-3.5 h-3.5 text-accent" />
          <span className="font-mono uppercase tracking-[0.16em] text-[10px]">No account connected</span>
        </span>
        <span className="text-text-muted hidden md:inline">
          Run paper bots, or connect a Binance API key to track your real account.
        </span>
        <div className="flex-1" />
        <Link
          to="/profile"
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-[0.14em] text-accent border border-accent/40 hover:bg-accent-dim/30 transition-colors"
        >
          Connect
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center h-8 bg-panel/80 border-b border-border px-3 md:px-4 gap-3 md:gap-6 text-[11px] shrink-0 overflow-x-auto scrollbar-thin">
      <div className="flex items-center gap-1.5">
        <Tooltip
          title="Equity"
          content="Free USDT on connected venues + notional of open paper-bot positions + unrealized PnL on those positions. Funds locked in venue limit orders are not yet counted."
          side="bottom"
        >
          <span className="text-text-muted cursor-help">{t('equity')}</span>
        </Tooltip>
        <FlashPrice
          value={totalEquity}
          format={n => `$${formatUsd(n)}`}
          size="sm"
          className="font-medium"
        />
      </div>

      <Divider />

      <div className="hidden md:flex items-center gap-1.5">
        <Tooltip title="Available" content="Free USDT across unlocked venues — what you could spend on a new live order right now." side="bottom">
          <span className="text-text-muted cursor-help">{t('available')}</span>
        </Tooltip>
        <span className="font-mono text-text-primary">${formatUsd(venueSnapshot.usdtFree)}</span>
        {venueSnapshot.venues.length > 0 && (
          <span className="text-[9px] uppercase tracking-wider text-text-muted">
            · {venueSnapshot.venues.join(' / ')}
          </span>
        )}
      </div>

      <Divider />

      <div className="flex items-center gap-1.5">
        <Tooltip title="Open positions" content="Notional of all open bot positions across paper and live mode." side="bottom">
          <span className="text-text-muted cursor-help">Open</span>
        </Tooltip>
        <span className="font-mono text-text-primary">${formatUsd(botSnapshot.notionalOpen)}</span>
        {botSnapshot.openCount > 0 && (
          <span className="bg-accent-dim text-accent text-[10px] px-1.5 py-0.5 rounded-full font-medium">
            {botSnapshot.openCount}
          </span>
        )}
        {maxExposureUsd > 0 && (
          <Tooltip
            title="Exposure cap"
            content={`Open notional vs the cap configured in Settings → Risk caps. Bots are blocked from opening trades that would push past 100%.`}
            side="bottom"
          >
            <span className="hidden md:flex items-center gap-1.5 cursor-help">
              <span className="w-12 h-1 rounded-full bg-surface overflow-hidden">
                <span
                  className={cn(
                    'h-full block transition-[width] duration-300',
                    exposureTone === 'short' ? 'bg-short'
                      : exposureTone === 'amber' ? 'bg-amber-400'
                      : 'bg-long',
                  )}
                  style={{ width: `${exposurePct.toFixed(1)}%` }}
                />
              </span>
              <span className={cn(
                'text-[9px] font-mono tabular-nums',
                exposureTone === 'short' ? 'text-short'
                  : exposureTone === 'amber' ? 'text-amber-400'
                  : 'text-text-muted',
              )}>
                {exposurePct.toFixed(0)}%
              </span>
            </span>
          </Tooltip>
        )}
      </div>

      <Divider />

      <div className="flex items-center gap-1.5">
        <Tooltip
          title="Unrealized P&L"
          content="Mark-to-market PnL on currently open bot positions. Becomes 'realized' when the trade closes."
          side="bottom"
        >
          <span className="text-text-muted cursor-help">{t('unrealized')}</span>
        </Tooltip>
        <FlashPrice
          value={botSnapshot.unrealized}
          format={n => `${n >= 0 ? '+' : ''}$${formatUsd(Math.abs(n))}`}
          size="sm"
          className={cn('font-medium', botSnapshot.unrealized >= 0 ? 'text-long' : 'text-short')}
        />
      </div>

      <Divider hideOnMobile />

      <div className="hidden md:flex items-center gap-1.5">
        <Tooltip title="Realized (today)" content="Sum of bot PnL on trades closed within the last 24 hours." side="bottom">
          <span className="text-text-muted cursor-help">{t('daily_pnl')}</span>
        </Tooltip>
        <span className={cn('font-mono', botSnapshot.realizedToday >= 0 ? 'text-long' : 'text-short')}>
          {botSnapshot.realizedToday >= 0 ? '+' : ''}${formatUsd(Math.abs(botSnapshot.realizedToday))}
        </span>
      </div>

      <div className="flex-1" />

      {!hasConnection && hasBots && (
        <Link
          to="/profile"
          className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-[0.14em] text-accent border border-accent/40 hover:bg-accent-dim/30 transition-colors"
          title="Bots are running paper-only. Connect a Binance API key to enable live mode."
        >
          Connect for live
          <ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

function Divider({ hideOnMobile }: { hideOnMobile?: boolean } = {}) {
  return <div className={cn('w-px h-3 bg-border', hideOnMobile && 'hidden md:block')} />
}

interface VenueSnapshot {
  usdtFree: number
  venues: string[]
}

function summariseVenues(states: Record<VenueId, { balances: { asset: string; free: number }[] | null }>): VenueSnapshot {
  let usdtFree = 0
  const venues: string[] = []
  for (const venueId of Object.keys(states) as VenueId[]) {
    const balances = states[venueId]?.balances
    if (!balances) continue
    const usdt = balances.find(b => b.asset === 'USDT')
    if (!usdt) continue
    usdtFree += usdt.free
    venues.push(venueId)
  }
  return { usdtFree, venues }
}

interface BotSnapshot {
  openCount: number
  notionalOpen: number
  unrealized: number
  realizedToday: number
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function summariseBots(trades: { closedAt?: number; openedAt: number; pnlUsd?: number; entryPrice: number; size: number; positionUsd: number; direction: 'long' | 'short'; marketId: string }[]): BotSnapshot {
  let openCount = 0
  let notionalOpen = 0
  let unrealized = 0
  let realizedToday = 0
  const cutoff = Date.now() - ONE_DAY_MS

  for (const t of trades) {
    if (t.closedAt === undefined) {
      openCount += 1
      notionalOpen += t.positionUsd
      const ticker = getActiveAdapter().getTicker(t.marketId)
      const mark = ticker?.price ?? t.entryPrice
      const sign = t.direction === 'long' ? 1 : -1
      unrealized += sign * (mark - t.entryPrice) * t.size
    } else if (t.closedAt >= cutoff && t.pnlUsd != null) {
      realizedToday += t.pnlUsd
    }
  }

  return { openCount, notionalOpen, unrealized, realizedToday }
}
