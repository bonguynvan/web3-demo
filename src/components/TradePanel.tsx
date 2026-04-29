/**
 * TradePanel — tab switcher between perp order entry and futures.
 *
 * Lives in the right sidebar slot in App.tsx. Spot/margin/pool tabs were
 * removed in the trading-terminal pivot.
 */

import { useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Web3OrderForm } from './Web3OrderForm'
import { cn } from '../lib/format'

const FuturesOrderForm = lazy(() => import('./futures/FuturesOrderForm').then(m => ({ default: m.FuturesOrderForm })))
const FuturesPositionsTable = lazy(() => import('./futures/FuturesPositionsTable').then(m => ({ default: m.FuturesPositionsTable })))

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-32 text-text-muted">
      <Loader2 className="w-4 h-4 animate-spin" />
    </div>
  )
}

type PanelTab = 'trade' | 'futures'

export function TradePanel() {
  const { t } = useTranslation('perp')
  const [tab, setTab] = useState<PanelTab>('trade')

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 mb-1 shrink-0">
        {(['trade', 'futures'] as const).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              'flex-1 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md transition-colors cursor-pointer',
              tab === tabKey
                ? 'bg-panel text-text-primary border border-border'
                : 'bg-surface text-text-muted hover:text-text-secondary border border-transparent'
            )}
          >
            {t(tabKey)}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'trade' && <Web3OrderForm />}
        {tab === 'futures' && (
          <Suspense fallback={<LazyFallback />}>
            <div className="flex flex-col h-full">
              <div className="flex-[2] min-h-0">
                <FuturesOrderForm />
              </div>
              <div className="flex-1 min-h-[150px] border-t border-border">
                <FuturesPositionsTable />
              </div>
            </div>
          </Suspense>
        )}
      </div>
    </div>
  )
}
