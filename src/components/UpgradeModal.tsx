/**
 * UpgradeModal — the only payment surface in the SPA.
 *
 * Opens when the user clicks the Pro badge, a feature gate, or a
 * "Top up" CTA. Renders four invoice options and a small "current
 * entitlement" header so the user knows how much Pro time they
 * already have stacked.
 *
 * Flow on click:
 *   1. createInvoice(userId, kind, amountUsd, returnTo)
 *   2. receive { invoice_url }
 *   3. window.location = invoice_url (NOWPayments hosted checkout)
 *   4. user pays; NOWPayments redirects back to returnTo
 *   5. backend's IPN webhook fires independently and credits the
 *      entitlement. The next /api/me poll picks it up.
 */

import { useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Zap } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useAuthStore } from '../store/authStore'
import { useEntitlementStore } from '../store/entitlementStore'
import { createInvoice, nowpayAvailable, type InvoiceKind } from '../api/nowpay'
import { deriveProState, labelForSource } from '../lib/pro'
import { cn } from '../lib/format'

interface Plan {
  kind: InvoiceKind
  amountUsd: number
  label: string
  detail: string
  featured?: boolean
}

const PLANS: Plan[] = [
  { kind: 'sub_30',     amountUsd: 5,  label: '30 days',  detail: '~$0.17/day' },
  { kind: 'sub_180',    amountUsd: 25, label: '180 days', detail: '~$0.14/day', featured: true },
  { kind: 'sub_365',    amountUsd: 50, label: '365 days', detail: '~$0.14/day · best value' },
  { kind: 'paygo_topup',amountUsd: 5,  label: '$5 balance', detail: '$0.10/day pay-as-you-go' },
]

export function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore(s => s.user)
  const me = useEntitlementStore(s => s.data)
  const proState = deriveProState(me)
  const [busy, setBusy] = useState<InvoiceKind | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const handlePick = async (plan: Plan) => {
    if (!user) { setErr('sign in first'); return }
    if (!nowpayAvailable()) { setErr('NOWPayments not configured'); return }
    setBusy(plan.kind)
    setErr(null)
    try {
      const inv = await createInvoice({
        userId: user.id,
        kind: plan.kind,
        amountUsd: plan.amountUsd,
        returnTo: `${window.location.origin}/billing?ref=${plan.kind}`,
      })
      window.location.href = inv.invoice_url
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upgrade to Pro" maxWidth="max-w-lg">
      <div className="p-5 space-y-5">
        <CurrentTier
          source={labelForSource(proState.source)}
          active={proState.active}
          daysLeft={proState.daysLeft}
          balanceUsd={proState.balanceUsd}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {PLANS.map(p => (
            <PlanCard
              key={p.kind}
              plan={p}
              busy={busy === p.kind}
              disabled={busy !== null}
              onClick={() => handlePick(p)}
            />
          ))}
        </div>

        {err && (
          <div className="text-[11px] text-short font-mono leading-snug">{err}</div>
        )}

        <div className="text-[10px] text-text-muted leading-relaxed border-t border-border pt-3">
          Payment in USDT, BTC, ETH, SOL and more via{' '}
          <a
            href="https://nowpayments.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline inline-flex items-center gap-0.5"
          >
            NOWPayments
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
          . You'll be redirected to a hosted checkout. Days <strong>stack</strong> —
          pay whenever, no auto-renew.
        </div>
      </div>
    </Modal>
  )
}

function CurrentTier({
  source, active, daysLeft, balanceUsd,
}: {
  source: string
  active: boolean
  daysLeft: number
  balanceUsd: number
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md bg-surface border border-border">
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-text-muted">Current tier</div>
        <div className="text-sm font-semibold text-text-primary">
          {source}{active ? '' : ' (inactive)'}
        </div>
      </div>
      <div className="text-right">
        {daysLeft >= 0 && (
          <div className="text-sm font-mono tabular-nums text-text-primary">{daysLeft}d left</div>
        )}
        {balanceUsd > 0 && (
          <div className="text-[10px] font-mono text-text-muted">
            ${balanceUsd.toFixed(2)} balance
          </div>
        )}
      </div>
    </div>
  )
}

function PlanCard({
  plan, busy, disabled, onClick,
}: {
  plan: Plan
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'text-left p-3 rounded-md border transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60',
        plan.featured
          ? 'border-accent/60 bg-accent-dim/40 hover:bg-accent-dim/70'
          : 'border-border bg-surface/60 hover:border-accent/40',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-text-primary">{plan.label}</span>
        {plan.featured && (
          <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-accent flex items-center gap-0.5">
            <Zap className="w-2.5 h-2.5" /> Best
          </span>
        )}
      </div>
      <div className="text-[11px] text-text-muted mb-2">{plan.detail}</div>
      <div className="flex items-center justify-between">
        <span className="text-lg font-mono font-bold text-text-primary">${plan.amountUsd}</span>
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-accent opacity-0" />
        )}
      </div>
    </button>
  )
}
