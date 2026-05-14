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
import { CheckCircle2, ExternalLink, Loader2, Zap, Sparkles } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useAuthStore } from '../store/authStore'
import { useEntitlementStore } from '../store/entitlementStore'
import { createInvoice, nowpayAvailable, type InvoiceKind } from '../api/nowpay'
import { fetchMe, startTrial } from '../api/auth'
import { deriveProState, labelForSource } from '../lib/pro'
import { cn } from '../lib/format'

interface Plan {
  kind: InvoiceKind
  amountUsd: number
  label: string
  detail: string
  featured?: boolean
  /** Shoulder badge — e.g. "Save $10" on sub_365 vs 12× sub_30. */
  badge?: string
}

// Savings: sub_30 × 12 = $60 → sub_365 = $50 saves $10.
//          sub_30 ×  6 = $30 → sub_180 = $25 saves $5.
const PLANS: Plan[] = [
  { kind: 'sub_30',     amountUsd: 5,  label: '30 days',  detail: '~$0.17/day' },
  { kind: 'sub_180',    amountUsd: 25, label: '180 days', detail: '~$0.14/day', featured: true, badge: 'Save $5' },
  { kind: 'sub_365',    amountUsd: 50, label: '365 days', detail: '~$0.14/day · best value', badge: 'Save $10' },
  { kind: 'paygo_topup',amountUsd: 5,  label: '$5 balance', detail: '$0.10/day pay-as-you-go' },
]

export function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore(s => s.user)
  const me = useEntitlementStore(s => s.data)
  const proState = deriveProState(me)
  const [busy, setBusy] = useState<InvoiceKind | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [trialBusy, setTrialBusy] = useState(false)
  const [trialActivated, setTrialActivated] = useState(false)
  const setEnt = useEntitlementStore(s => s.set)
  const trialAvailable = !!user && me !== null && me.trial_expires_at === null

  const handleStartTrial = async () => {
    if (trialBusy) return
    setTrialBusy(true)
    setErr(null)
    try {
      await startTrial()
      const fresh = await fetchMe()
      setEnt(fresh)
      setTrialActivated(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setTrialBusy(false)
    }
  }

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

        {trialActivated ? (
          <div className="rounded-md border border-long/40 bg-long/10 px-4 py-3 space-y-2">
            <div className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-long" />
              Trial activated — 14 Pro days credited
            </div>
            <p className="text-[11px] text-text-secondary leading-snug">
              Premium signals (whale, news), Telegram delivery, and AI explainer
              are all live now. The single biggest payoff in the first 5 minutes
              is wiring Telegram alerts so signals reach you when you're not on
              the page.
            </p>
            <a
              href="/trade"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-surface text-[11px] font-semibold uppercase tracking-[0.14em] hover:opacity-90 transition-opacity"
            >
              <Sparkles className="w-3 h-3" />
              Set up Telegram alerts →
            </a>
          </div>
        ) : trialAvailable && (
          <button
            onClick={handleStartTrial}
            disabled={trialBusy}
            className={cn(
              'w-full flex items-center justify-between gap-3 rounded-md border border-accent/60 bg-accent-dim/40 px-4 py-3 cursor-pointer transition-colors hover:bg-accent-dim/60',
              trialBusy && 'opacity-60 cursor-wait',
            )}
          >
            <div className="text-left">
              <div className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                Start free 14-day Pro trial
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                No payment required. Activates everything below; you can buy time after.
              </div>
            </div>
            {trialBusy ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> : <Zap className="w-4 h-4 text-accent" />}
          </button>
        )}

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

        {user && (
          <div className="text-[10px] text-text-muted leading-relaxed border-t border-border pt-3">
            Prefer free days? Each friend who signs in via your referral link
            adds <strong className="text-text-primary">+7 days</strong> to your
            Pro entitlement (and theirs). Grab your link on{' '}
            <a href="/profile" className="text-accent hover:underline">
              /profile
            </a>.
          </div>
        )}
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
        <div className="flex items-center gap-1">
          {plan.badge && (
            <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-long bg-long/15 border border-long/30 rounded px-1.5 py-0.5">
              {plan.badge}
            </span>
          )}
          {plan.featured && (
            <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-accent flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" /> Best
            </span>
          )}
        </div>
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
