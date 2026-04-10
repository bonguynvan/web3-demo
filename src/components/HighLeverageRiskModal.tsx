/**
 * HighLeverageRiskModal — one-time confirmation when the user submits an
 * order at high leverage. Dismissible "don't show again" persists via the
 * settings store.
 *
 * Behaviour:
 *   - Triggered before the actual trade fires (the order form decides when
 *     to mount this with `open={true}`)
 *   - Cancel = abort the trade
 *   - Confirm = fire the trade. Optionally also dismisses future warnings.
 *   - Once dismissed (don't show again), this component is bypassed entirely
 *     by the order form so it never even mounts.
 *
 * Why a separate modal instead of an inline warning: the goal is to add a
 * friction step that's hard to click through accidentally. An inline banner
 * gets ignored; a modal makes the user pause.
 */

import { useState } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useSettingsStore } from '../store/settingsStore'
import { cn } from '../lib/format'

export const HIGH_LEVERAGE_THRESHOLD = 10

interface HighLeverageRiskModalProps {
  open: boolean
  leverage: number
  /** Approximate buffer to liquidation in % at this leverage. */
  liqBufferPct: number
  onCancel: () => void
  onConfirm: () => void
}

export function HighLeverageRiskModal({
  open,
  leverage,
  liqBufferPct,
  onCancel,
  onConfirm,
}: HighLeverageRiskModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const setHide = useSettingsStore(s => s.setHideHighLeverageRiskWarning)

  const handleConfirm = () => {
    if (dontShowAgain) {
      setHide(true)
    }
    onConfirm()
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="High leverage warning"
      maxWidth="max-w-md"
      footer={
        <>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-500/90 rounded transition-colors cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            I understand, place {leverage}× order
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs leading-relaxed text-text-secondary">
        {/* Hero icon + headline */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">
              You're trading at {leverage}× leverage
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              A {liqBufferPct.toFixed(1)}% adverse price move triggers liquidation.
            </div>
          </div>
        </div>

        {/* What this means */}
        <div className="bg-surface/60 rounded-md p-3 space-y-2">
          <RiskRow
            value="Faster liquidation"
            description="High leverage shrinks the price buffer between mark and liquidation. A small adverse move wipes the position."
          />
          <RiskRow
            value="Funding fees scale with size"
            description="Position notional = collateral × leverage. Funding rates apply to the full notional, not just your collateral."
          />
          <RiskRow
            value="Slippage matters more"
            description="High-leverage entries are more sensitive to price impact and slippage tolerance — a few bps can swing your liq line."
          />
        </div>

        {/* Don't show again */}
        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={e => setDontShowAgain(e.target.checked)}
            className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
          />
          <span className="text-[11px] text-text-secondary">
            Don't show this warning again
          </span>
          <span className="text-[10px] text-text-muted ml-auto">
            (re-enable in Settings)
          </span>
        </label>
      </div>
    </Modal>
  )
}

function RiskRow({ value, description }: { value: string; description: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className={cn('w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0')} />
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-text-primary">{value}</div>
        <div className="text-[10px] text-text-muted leading-relaxed">{description}</div>
      </div>
    </div>
  )
}
