/**
 * OnboardingCard — first-run guided checklist.
 *
 * Replaces the static tip list with a 2-step progress card that watches
 * actual store state and ticks each step off as the user completes it.
 * Auto-dismisses when both steps are complete; the user can also skip
 * forever via the X button. The same localStorage flag (tc-onboarded-v1)
 * gates the previous static card so existing users don't see this fresh.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { X, Bot, BookOpen, KeyRound, Check, Sparkles } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useFollowStore } from '../store/followStore'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { cn } from '../lib/format'

const STORAGE_KEY = 'tc-onboarded-v1'

function loadDismissed(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

export function OnboardingCard() {
  const [dismissed, setDismissed] = useState(() => loadDismissed())
  const bots = useBotStore(s => s.bots)
  const followedStrategies = useFollowStore(s => s.strategies)
  const vaultUnlocked = useVaultSessionStore(s => s.unlocked)
  const { isConnected: walletConnected } = useAccount()

  const haveBot = bots.length > 0 || followedStrategies.length > 0
  const haveConnection = vaultUnlocked || walletConnected

  // Both steps complete → quietly auto-dismiss after a short delay so
  // the user gets the satisfying "all done" tick before it disappears.
  useEffect(() => {
    if (dismissed) return
    if (haveBot && haveConnection) {
      const t = setTimeout(() => {
        setDismissed(true)
        try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* full */ }
      }, 1800)
      return () => clearTimeout(t)
    }
  }, [haveBot, haveConnection, dismissed])

  if (dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* full */ }
  }

  const stepsCompleted = (haveBot ? 1 : 0) + (haveConnection ? 1 : 0)
  const allDone = stepsCompleted === 2

  return (
    <div className="fixed bottom-20 md:bottom-4 right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] bg-panel border border-accent/40 rounded-lg shadow-lg shadow-accent/10 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            {allDone ? "You're set" : 'Get started'}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5 font-mono uppercase tracking-[0.14em]">
            {stepsCompleted}/2 done
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-text-muted hover:text-text-primary cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="h-1 w-full bg-surface rounded mb-3 overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-500"
          style={{ width: `${(stepsCompleted / 2) * 100}%` }}
        />
      </div>

      <div className="space-y-2.5 mb-3">
        <Step
          done={haveBot}
          Icon={haveBot ? Bot : BookOpen}
          title="Add a strategy"
          body="Browse the marketplace and follow or install a bot to start running paper trades."
          ctaTo="/library"
          ctaLabel="Open library"
          showCta={!haveBot}
        />
        <Step
          done={haveConnection}
          Icon={KeyRound}
          title="Connect a venue (optional)"
          body="Bots stay paper-only without a connection. Add a Binance API key or wallet to flip them live."
          ctaTo="/profile"
          ctaLabel="Connect"
          showCta={!haveConnection}
        />
      </div>

      <button
        onClick={dismiss}
        className={cn(
          'w-full py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer',
          allDone
            ? 'bg-accent text-surface hover:opacity-90'
            : 'bg-surface border border-border text-text-secondary hover:text-text-primary',
        )}
      >
        {allDone ? 'Nice — close this' : 'Skip for now'}
      </button>
    </div>
  )
}

function Step({
  done, Icon, title, body, ctaTo, ctaLabel, showCta,
}: {
  done: boolean
  Icon: typeof Bot
  title: string
  body: string
  ctaTo: string
  ctaLabel: string
  showCta: boolean
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className={cn(
          'shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors',
          done ? 'bg-long/20 text-long' : 'bg-accent-dim text-accent',
        )}
      >
        {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn(
          'text-xs font-medium',
          done ? 'text-text-secondary line-through decoration-text-muted' : 'text-text-primary',
        )}>
          {title}
        </div>
        <div className="text-[11px] text-text-muted leading-snug">{body}</div>
        {showCta && (
          <Link
            to={ctaTo}
            className="inline-block mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-accent hover:underline"
          >
            {ctaLabel} →
          </Link>
        )}
      </div>
    </div>
  )
}
