/**
 * TradePage — research workstation: chart + positions + signals/bots panels.
 *
 * Manual order entry was removed in the "TradingView lane" pivot — every
 * venue (Binance, Hyperliquid, OKX, …) has a better terminal than we
 * could build, so we focus on signals and bot strategy. The right rail
 * is Signals or Bots; the bottom row is the bot ledger via PositionsTable;
 * a venue deep-link sits next to the active market for users who want
 * to execute.
 */

import { useState } from 'react'
import { TradingChart } from '../components/TradingChart'
import { PositionsTable } from '../components/PositionsTable'
import { SignalsPanel } from '../components/SignalsPanel'
import { BotsPanel } from '../components/BotsPanel'
import { Watchlist } from '../components/Watchlist'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { MobileTradeLayout } from '../components/MobileTradeLayout'
import { useIsMobile } from '../hooks/useBreakpoint'
import { useMarketWs } from '../hooks/useMarketWs'
import { useTradingStore } from '../store/tradingStore'
import { useActiveVenue } from '../hooks/useActiveVenue'
import { venueTradeLink } from '../lib/venueLinks'
import { ExternalLink } from 'lucide-react'
import { cn } from '../lib/format'

type TradeTab = 'signals' | 'bots'

export function TradePage() {
  const isMobile = useIsMobile()
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const venueId = useActiveVenue()
  const [tradeTab, setTradeTab] = useState<TradeTab>('signals')

  const { loading: chartLoading } = useMarketWs({
    wsUrl: null,
    market: selectedMarket.symbol,
  })

  if (isMobile) {
    return <MobileTradeLayout chartLoading={chartLoading} />
  }

  const venueLink = venueTradeLink(selectedMarket.symbol, venueId)

  return (
    <div className="flex-1 flex flex-col xl:flex-row gap-1 p-1 h-full min-h-0">
      <div className="flex-1 flex flex-col gap-1 min-w-0 min-h-0">
        <div className="flex-[4] min-h-[320px] xl:min-h-0">
          <ErrorBoundary name="Chart">
            <TradingChart loading={chartLoading} />
          </ErrorBoundary>
        </div>
        <div className="flex-1 min-h-[160px] xl:min-h-0">
          <ErrorBoundary name="Positions">
            <PositionsTable />
          </ErrorBoundary>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-1 shrink-0 xl:w-[340px]">
        <div className="xl:w-[340px] shrink-0 min-h-[400px] xl:min-h-0 flex flex-col">
          <div className="shrink-0 mb-1 max-h-[180px] overflow-y-auto bg-panel rounded-md border border-border">
            <Watchlist />
          </div>

          {venueLink && (
            <a
              href={venueLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 mb-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-panel border border-accent/40 text-accent text-[10px] uppercase tracking-[0.16em] font-mono hover:bg-accent-dim/30 transition-colors"
              title="Execute this market on the venue's own terminal"
            >
              {venueLink.label}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <div className="flex gap-1 mb-1 shrink-0">
            {(['signals', 'bots'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setTradeTab(tab)}
                className={cn(
                  'flex-1 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md transition-colors cursor-pointer',
                  tradeTab === tab
                    ? 'bg-panel text-text-primary border border-border'
                    : 'bg-surface text-text-muted hover:text-text-secondary border border-transparent',
                )}
              >
                {tab === 'signals' ? 'Signals' : 'Bots'}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 bg-panel rounded-lg border border-border overflow-hidden">
            <ErrorBoundary name="Panel">
              {tradeTab === 'signals' ? <SignalsPanel /> : <BotsPanel />}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}
