/**
 * TradePanel — Tab switcher between order entry and LP deposit/withdraw.
 *
 * Lives in the right sidebar slot in App.tsx. Lets traders flip to the LP
 * panel without leaving the trading view.
 */

import { useState } from 'react'
import { Web3OrderForm } from './Web3OrderForm'
import { LpPanel } from './LpPanel'
import { SpotSwapForm } from './spot/SpotSwapForm'
import { cn } from '../lib/format'

type PanelTab = 'trade' | 'spot' | 'pool'

export function TradePanel() {
  const [tab, setTab] = useState<PanelTab>('trade')

  return (
    <div className="flex flex-col h-full">
      {/* Top tabs */}
      <div className="flex gap-1 mb-1 shrink-0">
        {(['trade', 'spot', 'pool'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md transition-colors cursor-pointer',
              tab === t
                ? 'bg-panel text-text-primary border border-border'
                : 'bg-surface text-text-muted hover:text-text-secondary border border-transparent'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Active panel — only mount the visible one to avoid duplicate
          contract reads from the inactive form. */}
      <div className="flex-1 min-h-0">
        {tab === 'trade' && <Web3OrderForm />}
        {tab === 'spot' && <SpotSwapForm />}
        {tab === 'pool' && <LpPanel />}
      </div>
    </div>
  )
}
