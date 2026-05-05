/**
 * MobileTradeLayout — mobile layout for the Trade page.
 *
 * Chart + tabbed bottom panel (positions / book / trades) + a sticky
 * "Trade on venue" deep-link CTA. Manual order entry was removed in
 * the "TradingView lane" pivot — research and bots here, execution on
 * the venue's own terminal.
 */

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { TradingChart } from './TradingChart'
import { PositionsTable } from './PositionsTable'
import { DepthBook } from './DepthBook'
import { RecentTrades } from './RecentTrades'
import { ErrorBoundary } from './ErrorBoundary'
import { useTradingStore } from '../store/tradingStore'
import { useActiveVenue } from '../hooks/useActiveVenue'
import { venueTradeLink } from '../lib/venueLinks'
import { cn } from '../lib/format'

type MobileTab = 'positions' | 'book' | 'trades'

export function MobileTradeLayout({ chartLoading }: { chartLoading: boolean }) {
  const [activeTab, setActiveTab] = useState<MobileTab>('positions')
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const venueId = useActiveVenue()
  const venueLink = venueTradeLink(selectedMarket.symbol, venueId)

  return (
    <>
      <div className="flex-1 flex flex-col gap-1 p-1 min-h-0">
        <div className="h-[45vh] min-h-[260px] shrink-0">
          <ErrorBoundary name="Chart">
            <TradingChart loading={chartLoading} />
          </ErrorBoundary>
        </div>

        <div className="flex items-center bg-panel rounded-lg border border-border shrink-0">
          {(['positions', 'book', 'trades'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 py-2.5 text-xs font-medium capitalize transition-colors cursor-pointer border-b-2',
                activeTab === tab
                  ? 'text-text-primary border-accent'
                  : 'text-text-muted border-transparent hover:text-text-secondary',
              )}
            >
              {tab === 'book' ? 'Book' : tab}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0">
          {activeTab === 'positions' && <ErrorBoundary name="Positions"><PositionsTable /></ErrorBoundary>}
          {activeTab === 'book' && <ErrorBoundary name="DepthBook"><DepthBook /></ErrorBoundary>}
          {activeTab === 'trades' && <ErrorBoundary name="Trades"><RecentTrades /></ErrorBoundary>}
        </div>
      </div>

      {venueLink && (
        <div
          className="shrink-0 px-3 py-2.5 border-t border-border bg-panel"
          style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
        >
          <a
            href={venueLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm text-surface bg-accent hover:opacity-90 transition-colors shadow-sm"
          >
            {venueLink.label}
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}
    </>
  )
}
