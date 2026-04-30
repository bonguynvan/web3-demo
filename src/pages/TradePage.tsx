/**
 * TradePage — perp + futures trading with chart, order book, and positions.
 *
 * This is the original single-page trading layout, now scoped to /trade.
 * Includes: chart, depth book, recent trades, order form (perp/futures tabs),
 * and positions table.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TradingChart } from '../components/TradingChart'
import { DepthBook } from '../components/DepthBook'
import { RecentTrades } from '../components/RecentTrades'
import { PositionsTable } from '../components/PositionsTable'
import { Web3OrderForm } from '../components/Web3OrderForm'
import { SignalsPanel } from '../components/SignalsPanel'
import { BotsPanel } from '../components/BotsPanel'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { MobileTradeLayout } from '../components/MobileTradeLayout'
import { useIsMobile } from '../hooks/useBreakpoint'
import { useMarketWs } from '../hooks/useMarketWs'
import { useTradingStore } from '../store/tradingStore'
import { cn } from '../lib/format'
import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'

const FuturesOrderForm = lazy(() => import('../components/futures/FuturesOrderForm').then(m => ({ default: m.FuturesOrderForm })))
const FuturesPositionsTable = lazy(() => import('../components/futures/FuturesPositionsTable').then(m => ({ default: m.FuturesPositionsTable })))

type TradeTab = 'perp' | 'futures' | 'signals' | 'bots'

export function TradePage() {
  const { t } = useTranslation('perp')
  const isMobile = useIsMobile()
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const [tradeTab, setTradeTab] = useState<TradeTab>('perp')

  const { loading: chartLoading } = useMarketWs({
    wsUrl: null,
    market: selectedMarket.symbol,
  })

  if (isMobile) {
    return <MobileTradeLayout chartLoading={chartLoading} />
  }

  return (
    <div className="flex-1 flex flex-col xl:flex-row gap-1 p-1 h-full min-h-0">
      {/* Left: Chart + Positions */}
      <div className="flex-1 flex flex-col gap-1 min-w-0 min-h-0">
        <div className="flex-[3] min-h-[300px] xl:min-h-0">
          <ErrorBoundary name="Chart">
            <TradingChart loading={chartLoading} />
          </ErrorBoundary>
        </div>
        <div className="flex-[1.2] min-h-[200px] xl:min-h-0">
          <ErrorBoundary name="Positions">
            {tradeTab === 'futures' ? (
              <Suspense fallback={<LazyFallback />}>
                <FuturesPositionsTable />
              </Suspense>
            ) : (
              <PositionsTable />
            )}
          </ErrorBoundary>
        </div>
      </div>

      {/* Right: DepthBook + Trades + OrderForm */}
      <div className="xl:w-[600px] flex flex-col xl:flex-row gap-1 shrink-0">
        <div className="flex-1 flex flex-col gap-1 min-h-0">
          <div className="flex-[2] min-h-[200px] xl:min-h-0">
            <ErrorBoundary name="DepthBook">
              <DepthBook />
            </ErrorBoundary>
          </div>
          <div className="flex-1 min-h-[150px] xl:min-h-0">
            <ErrorBoundary name="Trades">
              <RecentTrades />
            </ErrorBoundary>
          </div>
        </div>
        <div className="xl:w-[280px] shrink-0 min-h-[400px] xl:min-h-0 flex flex-col">
          {/* Trade / Futures / Signals / Bots toggle */}
          <div className="flex gap-1 mb-1 shrink-0">
            {(['perp', 'futures', 'signals', 'bots'] as const).map(tab => (
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
                {tab === 'perp' ? t('trade')
                  : tab === 'futures' ? t('futures')
                  : tab === 'signals' ? 'Signals'
                  : 'Bots'}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            <ErrorBoundary name="OrderForm">
              {tradeTab === 'futures' ? (
                <Suspense fallback={<LazyFallback />}>
                  <FuturesOrderForm />
                </Suspense>
              ) : tradeTab === 'signals' ? (
                <SignalsPanel />
              ) : tradeTab === 'bots' ? (
                <BotsPanel />
              ) : (
                <Web3OrderForm />
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-32 text-text-muted">
      <Loader2 className="w-4 h-4 animate-spin" />
    </div>
  )
}
