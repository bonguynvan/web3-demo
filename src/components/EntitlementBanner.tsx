/**
 * EntitlementBanner — slim header banner for *current Pro users* whose
 * remaining time is running low.
 *
 * Intentionally does NOT fire when Pro has lapsed — for free users we
 * lean on ShipResultsBanner (positive, outcome-driven) so the SPA
 * doesn't nag people who haven't yet seen their bot make money.
 *
 * Dismiss persists 24h so it doesn't follow the user across reloads.
 */

import { useState } from 'react'
import { Clock, X } from 'lucide-react'
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

  // Only fires for paying users running low — never for free/lapsed.
  // Lapsed-user nudges are handled by the positive ShipResultsBanner so
  // we don't pressure people who haven't seen their bot make money yet.
  const lowDays = proState.active && proState.daysLeft >= 0 && proState.daysLeft <= 3
  if (!lowDays) return null
  if (recentlyDismissed) return null

  const message = `Pro ${proState.source === 'trial' ? 'trial' : 'time'} ends in ${proState.daysLeft} day${proState.daysLeft === 1 ? '' : 's'}.`

  return (
    <>
      <div className={cn('flex items-center gap-3 px-3 md:px-4 py-1.5 border-b text-xs bg-accent-dim/40 border-accent/40 text-accent')}>
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 leading-tight">{message}</span>
        <button
          onClick={() => setUpgradeOpen(true)}
          className="px-2 py-0.5 rounded font-semibold uppercase tracking-[0.14em] text-[10px] bg-accent text-surface hover:opacity-90 transition-opacity cursor-pointer"
        >
          Top up
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
