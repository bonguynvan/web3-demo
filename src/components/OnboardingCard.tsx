/**
 * OnboardingCard — one-time first-run welcome card.
 *
 * Shown bottom-right on first visit only. Dismissed forever via the
 * localStorage flag `tc-onboarded-v1`. Pure presentation; no data calls.
 */

import { useState } from 'react'
import { X, Zap, Bot, BarChart3, KeyRound } from 'lucide-react'

const STORAGE_KEY = 'tc-onboarded-v1'

function loadDismissed(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

export function OnboardingCard() {
  const [dismissed, setDismissed] = useState(() => loadDismissed())
  if (dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* full */ }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] bg-panel border border-accent/40 rounded-lg shadow-lg shadow-accent/10 p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="text-sm font-semibold text-text-primary">Welcome to TradingDek</div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-text-muted hover:text-text-primary cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2.5 mb-3">
        <Tip
          Icon={Zap}
          title="Live signals panel"
          body="Eight sources scan all top markets. Click a card to focus the chart and pre-fill an order."
        />
        <Tip
          Icon={BarChart3}
          title="Hit-rate tracking"
          body="Open the sliders icon — see per-source win rate, best markets, and recent outcomes."
        />
        <Tip
          Icon={Bot}
          title="Paper bots"
          body="Visit /bots. Start with the seeded Confluence Sniper or build your own."
        />
        <Tip
          Icon={KeyRound}
          title="Live trading (when ready)"
          body="Connect a Binance API key on /profile. Cmd/Ctrl+L places a live limit order from anywhere."
        />
      </div>
      <button
        onClick={dismiss}
        className="w-full py-1.5 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
      >
        Got it
      </button>
    </div>
  )
}

function Tip({ Icon, title, body }: { Icon: typeof Zap; title: string; body: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="shrink-0 w-7 h-7 rounded-md bg-accent-dim flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary">{title}</div>
        <div className="text-[11px] text-text-muted leading-snug">{body}</div>
      </div>
    </div>
  )
}
