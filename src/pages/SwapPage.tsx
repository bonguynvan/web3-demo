/**
 * SwapPage — dedicated spot swap page with clean, focused layout.
 *
 * No chart or order book needed — just the swap form, history,
 * and a simple market info section.
 */

import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { cn } from '../lib/format'

const SpotSwapForm = lazy(() => import('../components/spot/SpotSwapForm').then(m => ({ default: m.SpotSwapForm })))
const SwapHistory = lazy(() => import('../components/spot/SwapHistory').then(m => ({ default: m.SwapHistory })))

type SwapTab = 'swap' | 'history'

export function SwapPage() {
  const { t } = useTranslation('spot')
  const [tab, setTab] = useState<SwapTab>('swap')

  return (
    <div className="h-full flex items-start justify-center p-4 md:pt-8 overflow-y-auto">
      <div className="w-full max-w-[420px]">
        {/* Tab toggle */}
        <div className="flex gap-1 mb-3">
          {(['swap', 'history'] as const).map(t_tab => (
            <button
              key={t_tab}
              onClick={() => setTab(t_tab)}
              className={cn(
                'flex-1 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors cursor-pointer',
                tab === t_tab
                  ? 'bg-panel text-text-primary border border-border'
                  : 'bg-surface text-text-muted hover:text-text-secondary border border-transparent',
              )}
            >
              {t_tab === 'swap' ? t('swap') : t('swap_history')}
            </button>
          ))}
        </div>

        {/* Content */}
        <Suspense fallback={
          <div className="flex items-center justify-center h-64 text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        }>
          {tab === 'swap' ? <SpotSwapForm /> : <SwapHistory />}
        </Suspense>
      </div>
    </div>
  )
}
