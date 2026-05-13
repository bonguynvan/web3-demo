/**
 * EntitlementBanner — slim header banner that nudges the user when
 * Pro is about to lapse.
 *
 * Fires when daysLeft <= 3 (trial or paid) or when Pro just expired.
 * Dismiss persists for 24h so it doesn't follow the user across every
 * page reload. Mounted globally in AppShell below LiveStatusBanner.
 */

import { useState } from 'react'
import { Clock, Sparkles, X } from 'lucide-react'
import { apiAvailable } from '../api/client'
import { useEntitlementStore } from '../store/entitlementStore'
import { useAuthStore } from '../store/authStore'
import { deriveProState } from '../lib/pro'
import { UpgradeModal } from './UpgradeModal'
import { cn } from '../lib/format'

const DISMISS_KEY = 'tc-ent-banner-dismissed-v1'
const DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000

function loadDismissedAt(): number {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    return raw ? Number(raw) : 0
  } catch { return 0 }
}

function markDismissed() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* full */ }
}

export function EntitlementBanner() {
  const [dismissedAt, setDismissedAt] = useState<number>(() => loadDismissedAt())
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const token = useAuthStore(s => s.token)
  const me = useEntitlementStore(s => s.data)

  if (!apiAvailable() || !token) return null

  const proState = deriveProState(me)
  const recentlyDismissed = Date.now() - dismissedAt < DISMISS_WINDOW_MS

  const lowDays = proState.active && proState.daysLeft >= 0 && proState.daysLeft <= 3
  const lapsed = !proState.active && me !== null

  if (!lowDays && !lapsed) return null
  if (recentlyDismissed) return null

  const tone = lapsed ? 'short' : 'accent'
  const message = lapsed
    ? 'Pro has lapsed — Telegram alerts, premium signals, and extra bots are off.'
    : `Pro ${proState.source === 'trial' ? 'trial' : 'time'} ends in ${proState.daysLeft} day${proState.daysLeft === 1 ? '' : 's'}.`

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-3 px-3 md:px-4 py-1.5 border-b text-xs',
          tone === 'short'
            ? 'bg-short/15 border-short/40 text-short'
            : 'bg-accent-dim/40 border-accent/40 text-accent',
        )}
      >
        {lapsed ? <Sparkles className="w-3.5 h-3.5 shrink-0" /> : <Clock className="w-3.5 h-3.5 shrink-0" />}
        <span className="flex-1 leading-tight">{message}</span>
        <button
          onClick={() => setUpgradeOpen(true)}
          className="px-2 py-0.5 rounded font-semibold uppercase tracking-[0.14em] text-[10px] bg-accent text-surface hover:opacity-90 transition-opacity cursor-pointer"
        >
          {lapsed ? 'Reactivate' : 'Top up'}
        </button>
        <button
          onClick={() => { markDismissed(); setDismissedAt(Date.now()) }}
          aria-label="Dismiss"
          className="text-text-muted hover:text-text-primary cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </>
  )
}
