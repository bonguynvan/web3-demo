/**
 * TradePanel — Tab switcher between order entry and LP deposit/withdraw.
 *
 * Lives in the right sidebar slot in App.tsx. Lets traders flip to the LP
 * panel without leaving the trading view.
 */

import { useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Web3OrderForm } from './Web3OrderForm'
import { LpPanel } from './LpPanel'
import { cn } from '../lib/format'

// Lazy-load spot components — only fetched when user clicks the Spot tab.
// Keeps the initial bundle focused on perp trading.
const SpotSwapForm = lazy(() => import('./spot/SpotSwapForm').then(m => ({ default: m.SpotSwapForm })))
const SwapHistory = lazy(() => import('./spot/SwapHistory').then(m => ({ default: m.SwapHistory })))

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-32 text-text-muted">
      <Loader2 className="w-4 h-4 animate-spin" />
    </div>
  )
}

type PanelTab = 'trade' | 'spot' | 'pool'
type SpotSubTab = 'swap' | 'history'

export function TradePanel() {
  const { t } = useTranslation('perp')
  const [tab, setTab] = useState<PanelTab>('trade')
  const [spotSubTab, setSpotSubTab] = useState<SpotSubTab>('swap')

  return (
    <div className="flex flex-col h-full">
      {/* Top tabs */}
      <div className="flex gap-1 mb-1 shrink-0">
        {(['trade', 'spot', 'pool'] as const).map(tabKey => (
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

      {/* Active panel — only mount the visible one to avoid duplicate
          contract reads from the inactive form. */}
      <div className="flex-1 min-h-0">
        {tab === 'trade' && <Web3OrderForm />}
        {tab === 'spot' && (
          <div className="flex flex-col h-full">
            {/* Spot sub-tabs */}
            <div className="flex items-center border-b border-border px-1 shrink-0">
              {(['swap', 'history'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setSpotSubTab(st)}
                  className={cn(
                    'px-3 py-2 text-[10px] font-medium capitalize transition-colors cursor-pointer border-b-2',
                    spotSubTab === st
                      ? 'text-text-primary border-accent'
                      : 'text-text-muted border-transparent hover:text-text-secondary'
                  )}
                >
                  {st}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Suspense fallback={<LazyFallback />}>
                {spotSubTab === 'swap' ? <SpotSwapForm /> : <SwapHistory />}
              </Suspense>
            </div>
          </div>
        )}
        {tab === 'pool' && <LpPanel />}
      </div>
    </div>
  )
}
