/**
 * ShipResultsBanner — positive-framing upgrade nudge that only fires
 * AFTER a user's paper bot has demonstrably worked.
 *
 * Funnel philosophy: nag-banners on a calendar clock scare off users
 * who haven't yet seen their bot make money. This banner waits for
 * the user to earn the right to be sold to — namely:
 *
 *   - User is signed in (we have someone to convert).
 *   - User is NOT already Pro (no point pitching).
 *   - User has at least MIN_CLOSED resolved paper/live trades.
 *   - Win rate is >= MIN_WIN_RATE.
 *
 * Once those line up, surface a single-line banner that opens the
 * UpgradeModal. Dismiss persists 7 days — long enough that "no" is
 * respected without forever silencing.
 */

import { useState } from 'react'
import { Sparkles, TrendingUp, X } from 'lucide-react'
import { apiAvailable } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useEntitlementStore } from '../store/entitlementStore'
import { useBotStore } from '../store/botStore'
import { deriveProState } from '../lib/pro'
import { UpgradeModal } from './UpgradeModal'

const MIN_CLOSED = 5
const MIN_WIN_RATE = 0.5
const DISMISS_KEY = 'tc-results-banner-v1'
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function loadDismissedAt(): number {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    return raw ? Number(raw) : 0
  } catch { return 0 }
}
function markDismissed() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* full */ }
}

export function ShipResultsBanner() {
  const [dismissedAt, setDismissedAt] = useState<number>(() => loadDismissedAt())
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const token = useAuthStore(s => s.token)
  const me = useEntitlementStore(s => s.data)
  const trades = useBotStore(s => s.trades)

  if (!apiAvailable() || !token) return null
  if (deriveProState(me).active) return null
  if (Date.now() - dismissedAt < DISMISS_WINDOW_MS) return null

  // Only resolved trades count — open positions can't validate anything.
  const resolved = trades.filter(t => t.closedAt !== undefined && t.pnlUsd !== undefined)
  if (resolved.length < MIN_CLOSED) return null

  const wins = resolved.filter(t => (t.pnlUsd ?? 0) > 0).length
  const winRate = wins / resolved.length
  if (winRate < MIN_WIN_RATE) return null

  const pctText = `${Math.round(winRate * 100)}%`

  return (
    <>
      <div className="flex items-center gap-3 px-3 md:px-4 py-1.5 border-b border-long/40 bg-long/15 text-text-primary text-xs">
        <TrendingUp className="w-3.5 h-3.5 text-long shrink-0" />
        <span className="flex-1 leading-tight">
          <span className="text-long font-semibold">{pctText} hit rate</span>{' '}
          across {resolved.length} resolved trades — flip on Telegram alerts and
          premium signals.
        </span>
        <button
          onClick={() => setUpgradeOpen(true)}
          className="px-2 py-0.5 rounded font-semibold uppercase tracking-[0.14em] text-[10px] bg-accent text-surface hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1"
        >
          <Sparkles className="w-3 h-3" />
          See plans
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
