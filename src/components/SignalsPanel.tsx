/**
 * SignalsPanel — live trading signals feed.
 *
 * Shows the highest-confidence signals first. Click a card to:
 *   - select that market in the store (so the chart switches)
 *   - pre-fill the order-form price with the suggested entry
 *
 * Phase S1 sources: funding extremes + EMA9/21 crossover. More to
 * come (liquidations, news, whales).
 */

import { useEffect, useState } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { useSignals } from '../hooks/useSignals'
import {
  getSignalAlertsEnabled,
  setSignalAlertsEnabled,
  ALERT_TOGGLE_EVENT,
} from '../hooks/useSignalAlerts'
import { cn } from '../lib/format'
import type { Signal } from '../signals/types'
import { TrendingUp, TrendingDown, Zap, Bell, BellOff } from 'lucide-react'

export function SignalsPanel() {
  const signals = useSignals()
  const setSelectedMarket = useTradingStore(s => s.setSelectedMarket)
  const setOrderPrice = useTradingStore(s => s.setOrderPrice)
  const setOrderSide = useTradingStore(s => s.setOrderSide)

  const [alertsEnabled, setAlertsEnabled] = useState(() => getSignalAlertsEnabled())
  // Sync if another tab/component flips the toggle
  useEffect(() => {
    const sync = () => setAlertsEnabled(getSignalAlertsEnabled())
    window.addEventListener(ALERT_TOGGLE_EVENT, sync)
    return () => window.removeEventListener(ALERT_TOGGLE_EVENT, sync)
  }, [])

  const toggleAlerts = async () => {
    const next = !alertsEnabled
    await setSignalAlertsEnabled(next)
    setAlertsEnabled(next)
  }

  const handleClick = (s: Signal) => {
    setSelectedMarket(s.marketId)
    setOrderSide(s.direction === 'long' ? 'long' : 'short')
    if (s.suggestedPrice !== undefined) {
      setOrderPrice(s.suggestedPrice.toFixed(2))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-accent" />
          Live signals
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">{signals.length} active</span>
          <button
            onClick={toggleAlerts}
            title={alertsEnabled ? 'Alerts on — click to disable' : 'Alerts off — click to enable'}
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded transition-colors cursor-pointer',
              alertsEnabled
                ? 'text-accent hover:bg-accent-dim/40'
                : 'text-text-muted hover:text-text-primary hover:bg-panel-light',
            )}
          >
            {alertsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {signals.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {signals.map(s => (
            <SignalCard key={s.id} signal={s} onClick={() => handleClick(s)} />
          ))}
        </div>
      )}

      <div className="px-3 py-2 border-t border-border shrink-0 text-[10px] text-text-muted leading-relaxed">
        Funding extremes + EMA9/21 crosses. Click a signal to pre-fill the order form.
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
      <Zap className="w-6 h-6 text-text-muted" />
      <span className="text-xs text-text-secondary">No signals firing right now</span>
      <span className="text-[10px] text-text-muted leading-relaxed max-w-[220px]">
        Signals appear as funding rates spike or moving averages cross.
        Switch venues or markets to see more.
      </span>
    </div>
  )
}

function SignalCard({ signal, onClick }: { signal: Signal; onClick: () => void }) {
  const isLong = signal.direction === 'long'
  const Arrow = isLong ? TrendingUp : TrendingDown
  const dirColor = isLong ? 'text-long' : 'text-short'
  const dirBg = isLong ? 'bg-long/10' : 'bg-short/10'
  const isConfluence = signal.source === 'confluence'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-border hover:bg-panel-light transition-colors cursor-pointer',
        isConfluence && 'border-l-2 border-l-accent bg-accent-dim/10',
      )}
    >
      <div className="flex items-start gap-2">
        <div className={cn('shrink-0 w-7 h-7 rounded-md flex items-center justify-center', dirBg)}>
          <Arrow className={cn('w-3.5 h-3.5', dirColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-medium text-text-primary truncate">{signal.title}</span>
            <span className={cn('text-[10px] uppercase tracking-wider font-semibold', dirColor)}>
              {signal.direction}
            </span>
          </div>
          <div className="text-[11px] text-text-muted leading-snug">
            {signal.detail}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
            <span className="font-mono">{signal.marketId}</span>
            <span>·</span>
            <span>conf {Math.round(signal.confidence * 100)}%</span>
            <span>·</span>
            <span className="capitalize">{signal.source}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
