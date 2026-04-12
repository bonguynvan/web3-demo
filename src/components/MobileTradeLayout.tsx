/**
 * MobileTradeLayout — mobile layout for the Trade page only.
 *
 * Simplified from MobileLayout: just chart + positions + Long/Short CTA.
 * Spot and Margin have their own pages now.
 */

import { useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, TrendingDown, X, Loader2 } from 'lucide-react'
import { TradingChart } from './TradingChart'
import { PositionsTable } from './PositionsTable'
import { DepthBook } from './DepthBook'
import { RecentTrades } from './RecentTrades'
import { Web3OrderForm } from './Web3OrderForm'
import { ErrorBoundary } from './ErrorBoundary'
import { useTradingStore } from '../store/tradingStore'
import { cn } from '../lib/format'

const FuturesOrderForm = lazy(() => import('./futures/FuturesOrderForm').then(m => ({ default: m.FuturesOrderForm })))

type MobileTab = 'positions' | 'book' | 'trades'

export function MobileTradeLayout({ chartLoading }: { chartLoading: boolean }) {
  const { t } = useTranslation('perp')
  const [activeTab, setActiveTab] = useState<MobileTab>('positions')
  const [orderOpen, setOrderOpen] = useState(false)
  const setOrderSide = useTradingStore(s => s.setOrderSide)
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  const openOrderForm = (side: 'long' | 'short') => {
    setOrderSide(side)
    setOrderOpen(true)
  }

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

      {/* Sticky bottom CTA */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-t border-border bg-panel"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => openOrderForm('long')}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg font-semibold text-sm text-white bg-long hover:bg-long/90 transition-colors cursor-pointer shadow-sm"
        >
          <TrendingUp className="w-4 h-4" />
          {t('long')} {selectedMarket.baseAsset}
        </button>
        <button
          onClick={() => openOrderForm('short')}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg font-semibold text-sm text-white bg-short hover:bg-short/90 transition-colors cursor-pointer shadow-sm"
        >
          <TrendingDown className="w-4 h-4" />
          {t('short')} {selectedMarket.baseAsset}
        </button>
      </div>

      {orderOpen && (
        <div className="fixed inset-0 z-[90] bg-surface flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-panel shrink-0">
            <span className="text-sm font-semibold text-text-primary">{t('place_order')}</span>
            <button
              onClick={() => setOrderOpen(false)}
              className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <ErrorBoundary name="OrderForm">
              <Web3OrderForm />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </>
  )
}
