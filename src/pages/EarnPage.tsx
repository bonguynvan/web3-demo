/**
 * EarnPage — Margin (Aave V3) + Pool (LP) in a clean two-column layout.
 */

import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { LpPanel } from '../components/LpPanel'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { cn } from '../lib/format'

const MarginPanel = lazy(() => import('../components/margin/MarginPanel').then(m => ({ default: m.MarginPanel })))

type EarnTab = 'margin' | 'pool'

export function EarnPage() {
  const { t: tPerp } = useTranslation('perp')
  const { t: tMargin } = useTranslation('margin')
  const [tab, setTab] = useState<EarnTab>('margin')

  return (
    <div className="h-full flex items-start justify-center p-4 md:pt-8 overflow-y-auto">
      <div className="w-full max-w-[480px]">
        {/* Tab toggle */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setTab('margin')}
            className={cn(
              'flex-1 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors cursor-pointer',
              tab === 'margin'
                ? 'bg-panel text-text-primary border border-border'
                : 'bg-surface text-text-muted hover:text-text-secondary border border-transparent',
            )}
          >
            {tMargin('margin')}
          </button>
          <button
            onClick={() => setTab('pool')}
            className={cn(
              'flex-1 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors cursor-pointer',
              tab === 'pool'
                ? 'bg-panel text-text-primary border border-border'
                : 'bg-surface text-text-muted hover:text-text-secondary border border-transparent',
            )}
          >
            {tPerp('pool')}
          </button>
        </div>

        {/* Content */}
        <ErrorBoundary name="Earn">
          {tab === 'margin' ? (
            <Suspense fallback={
              <div className="flex items-center justify-center h-64 text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            }>
              <MarginPanel />
            </Suspense>
          ) : (
            <LpPanel />
          )}
        </ErrorBoundary>
      </div>
    </div>
  )
}
