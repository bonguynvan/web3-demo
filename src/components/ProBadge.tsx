/**
 * ProBadge — header pill showing Pro status; opens UpgradeModal.
 *
 * Renders nothing if the backend isn't configured. When signed-out the
 * pill shows "Upgrade" and still opens the modal so visitors can see
 * pricing; the modal nudges them to sign in first.
 */

import { useState } from 'react'
import { Sparkles, Zap, Clock } from 'lucide-react'
import { apiAvailable } from '../api/client'
import { useEntitlementStore } from '../store/entitlementStore'
import { deriveProState } from '../lib/pro'
import { UpgradeModal } from './UpgradeModal'
import { cn } from '../lib/format'

export function ProBadge({ className }: { className?: string }) {
  const me = useEntitlementStore(s => s.data)
  const proState = deriveProState(me)
  const [open, setOpen] = useState(false)

  if (!apiAvailable()) return null

  const isPro = proState.active

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={
          isPro
            ? `Pro · ${proState.daysLeft >= 0 ? `${proState.daysLeft} days left` : 'active'}`
            : 'Upgrade to Pro'
        }
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono uppercase tracking-[0.14em] transition-colors cursor-pointer',
          isPro
            ? 'bg-accent-dim text-accent hover:bg-accent hover:text-surface'
            : 'bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-accent/60',
          className,
        )}
      >
        {isPro ? (
          <>
            <Sparkles className="w-3 h-3" />
            <span>Pro</span>
            {proState.daysLeft >= 0 && proState.daysLeft <= 7 && (
              <span className="flex items-center gap-0.5 text-[9px] opacity-80">
                <Clock className="w-2.5 h-2.5" />
                {proState.daysLeft}d
              </span>
            )}
          </>
        ) : (
          <>
            <Zap className="w-3 h-3" />
            <span>Upgrade</span>
          </>
        )}
      </button>
      <UpgradeModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
