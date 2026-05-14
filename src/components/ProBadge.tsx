/**
 * ProBadge — header pill showing Pro status; opens UpgradeModal.
 *
 * Renders nothing if the backend isn't configured. When signed-out the
 * pill shows "Upgrade" and still opens the modal so visitors can see
 * pricing; the modal nudges them to sign in first.
 */

import { useState } from 'react'
import { Sparkles, Zap, Clock, Wallet } from 'lucide-react'
import { apiAvailable } from '../api/client'
import { useEntitlementStore } from '../store/entitlementStore'
import { deriveProState } from '../lib/pro'
import { UpgradeModal } from './UpgradeModal'
import { cn } from '../lib/format'

export function ProBadge({ className }: { className?: string }) {
  const me = useEntitlementStore(s => s.data)
  const ps = deriveProState(me)
  const [open, setOpen] = useState(false)

  if (!apiAvailable()) return null

  const variants = {
    none: {
      icon: <Zap className="w-3 h-3" />,
      label: 'Upgrade',
      title: 'Upgrade to Pro',
      cls: 'bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-accent/60',
    },
    trial: {
      icon: <Sparkles className="w-3 h-3" />,
      label: `Trial · ${ps.daysLeft}d`,
      title: `Free trial · ${ps.daysLeft} day${ps.daysLeft === 1 ? '' : 's'} left`,
      cls: 'bg-accent-dim border border-accent/30 text-accent hover:bg-accent hover:text-surface',
    },
    days: {
      icon: <Clock className="w-3 h-3" />,
      label: `Pro · ${ps.daysLeft}d`,
      title: `Pro · ${ps.daysLeft} day${ps.daysLeft === 1 ? '' : 's'} of paid time remaining`,
      cls: 'bg-accent text-surface hover:opacity-90',
    },
    paygo: {
      icon: <Wallet className="w-3 h-3" />,
      label: `Paygo · $${ps.balanceUsd.toFixed(2)}`,
      title: `Pay-as-you-go: $${ps.balanceUsd.toFixed(2)} balance (~${ps.daysLeft} days at $0.10/day)`,
      cls: 'bg-long/15 border border-long/40 text-long hover:bg-long hover:text-surface',
    },
  } as const

  const v = variants[ps.source]

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={v.title}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono uppercase tracking-[0.14em] transition-colors cursor-pointer',
          v.cls,
          className,
        )}
      >
        {v.icon}
        <span>{v.label}</span>
      </button>
      <UpgradeModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
