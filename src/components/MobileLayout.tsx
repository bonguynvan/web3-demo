/**
 * MobileLayout — phone-first trading layout.
 *
 * Shape:
 *   ┌─────────────────────────┐
 *   │ Chart (50vh)            │
 *   ├─────────────────────────┤
 *   │ Tab bar                 │
 *   ├─────────────────────────┤
 *   │ Active panel (scroll)   │
 *   │ - positions             │
 *   │ - book                  │
 *   │ - trades                │
 *   ├─────────────────────────┤
 *   │ Sticky CTA              │
 *   │ [ Long ETH ] [ Short ]  │
 *   └─────────────────────────┘
 *
 * Tapping Long/Short opens the existing Web3OrderForm inside a full-screen
 * modal so the form is already pre-filled with the chosen side. Closing
 * the modal returns the user to the main view.
 *
 * Why a full-screen modal instead of a bottom sheet: the order form is
 * complex (limit price, advanced TP/SL, summary rows) and benefits from
 * the full viewport on small screens. A bottom sheet would either get
 * dismissed on the slightest scroll or take up the same space anyway.
 *
 * Desktop layout in App.tsx is untouched — this component only renders
 * when useIsMobile() is true.
 */

import { useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, TrendingDown, ArrowLeftRight, X, Loader2 } from 'lucide-react'
import { TradingChart } from './TradingChart'
import { PositionsTable } from './PositionsTable'
import { DepthBook } from './DepthBook'
import { RecentTrades } from './RecentTrades'
import { TradePanel } from './TradePanel'
import { ErrorBoundary } from './ErrorBoundary'
import { useTradingStore } from '../store/tradingStore'
import { cn } from '../lib/format'

const SpotSwapForm = lazy(() => import('./spot/SpotSwapForm').then(m => ({ default: m.SpotSwapForm })))

type MobileTab = 'positions' | 'book' | 'trades'

export function MobileLayout({ chartLoading }: { chartLoading: boolean }) {
  const { t } = useTranslation('perp')
  const [activeTab, setActiveTab] = useState<MobileTab>('positions')
  const [orderOpen, setOrderOpen] = useState(false)
  const [spotOpen, setSpotOpen] = useState(false)
  const setOrderSide = useTradingStore(s => s.setOrderSide)
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  const openOrderForm = (side: 'long' | 'short') => {
    setOrderSide(side)
    setOrderOpen(true)
  }

  return (
    <>
      <div className="flex-1 flex flex-col gap-1 p-1 min-h-0">
        {/* Chart — fixed share of viewport so the user can always see it */}
        <div className="h-[45vh] min-h-[260px] shrink-0">
          <ErrorBoundary name="Chart">
            <TradingChart loading={chartLoading} />
          </ErrorBoundary>
        </div>

        {/* Tab bar */}
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

        {/* Active panel — only one mounted at a time on mobile to keep DOM lean */}
        <div className="flex-1 min-h-0">
          {activeTab === 'positions' && (
            <ErrorBoundary name="Positions">
              <PositionsTable />
            </ErrorBoundary>
          )}
          {activeTab === 'book' && (
            <ErrorBoundary name="DepthBook">
              <DepthBook />
            </ErrorBoundary>
          )}
          {activeTab === 'trades' && (
            <ErrorBoundary name="Trades">
              <RecentTrades />
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* Sticky bottom CTA — Long / Short / Swap buttons.
          Pinned with safe-area insets so it sits above the iOS home indicator. */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-t border-border bg-panel"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => openOrderForm('long')}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg font-semibold text-sm text-white bg-long hover:bg-long/90 transition-colors cursor-pointer shadow-sm"
        >
          <TrendingUp className="w-4 h-4" />
          {t('long')}
        </button>
        <button
          onClick={() => openOrderForm('short')}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg font-semibold text-sm text-white bg-short hover:bg-short/90 transition-colors cursor-pointer shadow-sm"
        >
          <TrendingDown className="w-4 h-4" />
          {t('short')}
        </button>
        <button
          onClick={() => setSpotOpen(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg font-semibold text-sm text-white bg-accent hover:bg-accent/90 transition-colors cursor-pointer shadow-sm"
        >
          <ArrowLeftRight className="w-4 h-4" />
          {t('spot')}
        </button>
      </div>

      {/* Full-screen order modal — reuses the existing TradePanel verbatim */}
      {orderOpen && <MobileOrderModal onClose={() => setOrderOpen(false)} title={t('trade')} />}

      {/* Full-screen spot swap modal */}
      {spotOpen && <MobileSpotModal onClose={() => setSpotOpen(false)} />}
    </>
  )
}

function MobileOrderModal({ onClose, title }: { onClose: () => void; title?: string }) {
  return (
    <div className="fixed inset-0 z-[90] bg-surface flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-panel shrink-0">
        <span className="text-sm font-semibold text-text-primary">{title ?? 'Place order'}</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 p-2">
        <ErrorBoundary name="OrderForm">
          <TradePanel />
        </ErrorBoundary>
      </div>
    </div>
  )
}

function MobileSpotModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('perp')

  return (
    <div className="fixed inset-0 z-[90] bg-surface flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-panel shrink-0">
        <span className="text-sm font-semibold text-text-primary">{t('spot')} Swap</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 p-2 overflow-y-auto">
        <ErrorBoundary name="SpotSwap">
          <Suspense fallback={
            <div className="flex items-center justify-center h-32 text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          }>
            <SpotSwapForm />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}
