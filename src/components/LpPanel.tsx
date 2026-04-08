/**
 * LpPanel — Liquidity provider deposit/withdraw.
 *
 * Lets users add USDC to the vault in exchange for PLP tokens (LP shares).
 * Reads pool stats from useVault and current balances from useTokenBalance.
 * Live mode only — in demo mode, shows a soft notice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { Loader2 } from 'lucide-react'
import { useVault } from '../hooks/useVault'
import { useUsdcBalance, usePlpBalance } from '../hooks/useTokenBalance'
import { useVaultOperations, type VaultOpStatus } from '../hooks/useVaultOperations'
import { useIsDemo } from '../store/modeStore'
import { useToast } from '../store/toastStore'
import { cn, formatUsd } from '../lib/format'

type LpTab = 'deposit' | 'withdraw'

const PLP_DECIMALS = 6n // PLP inherits USDC's 6-dec scale

export function LpPanel() {
  const isDemo = useIsDemo()
  const { isConnected } = useAccount()
  const toast = useToast()

  const [tab, setTab] = useState<LpTab>('deposit')
  const [amount, setAmount] = useState('')

  const { stats } = useVault()
  const { dollars: usdcBalance } = useUsdcBalance()
  const { display: plpBalance, raw: plpBalanceRaw } = usePlpBalance()
  const { status, error, deposit, withdraw } = useVaultOperations()

  const amountNum = parseFloat(amount) || 0

  // PLP price in dollars — assumes 1:1 with pool USDC for an MVP AMM
  // (real GMX uses AUM/totalSupply; until we surface AUM here, the 1:1
  // approximation is fine for the deposit/withdraw UX).
  const plpPriceUsd = 1

  const isBusy = status !== 'idle' && status !== 'success' && status !== 'error'

  // ─── Validation ───
  const validation = useMemo(() => {
    if (!isConnected) return 'Connect wallet'
    if (amountNum <= 0) return 'Enter amount'
    if (tab === 'deposit' && amountNum > usdcBalance) return 'Insufficient USDC'
    if (tab === 'withdraw' && amountNum > plpBalance) return 'Insufficient PLP'
    return null
  }, [isConnected, amountNum, tab, usdcBalance, plpBalance])

  const canSubmit = !validation && !isBusy

  // ─── Toast on terminal states ───
  const prevStatusRef = useRef<VaultOpStatus>(status)
  useEffect(() => {
    if (prevStatusRef.current === status) return
    if (status === 'success') {
      toast.success(
        tab === 'deposit' ? 'Deposit complete' : 'Withdrawal complete',
        tab === 'deposit'
          ? `Added $${formatUsd(amountNum)} to the pool`
          : `Withdrew ${formatUsd(amountNum)} PLP`
      )
      setAmount('')
    } else if (status === 'error' && error) {
      toast.error(tab === 'deposit' ? 'Deposit failed' : 'Withdrawal failed', error)
    }
    prevStatusRef.current = status
  }, [status, error, tab, amountNum, toast])

  // ─── Submit handler ───
  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    if (tab === 'deposit') {
      await deposit(amountNum)
    } else {
      // PLP amount → 6-dec bigint
      const plpAmount = BigInt(Math.round(amountNum * Number(10n ** PLP_DECIMALS)))
      await withdraw(plpAmount)
    }
  }, [canSubmit, tab, amountNum, deposit, withdraw])

  // ─── Quick fill ───
  const handleQuickFill = (pct: number) => {
    const max = tab === 'deposit' ? usdcBalance : plpBalance
    setAmount(((max * pct) / 100).toFixed(2))
  }

  // ─── Receive preview ───
  const youReceive = tab === 'deposit'
    ? `${formatUsd(amountNum / plpPriceUsd)} PLP`
    : `$${formatUsd(amountNum * plpPriceUsd)} USDC`

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      {/* Tabs */}
      <div className="flex p-1.5 gap-1 border-b border-border">
        {(['deposit', 'withdraw'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setAmount('') }}
            className={cn(
              'flex-1 py-2 text-sm font-semibold rounded transition-all cursor-pointer capitalize',
              tab === t
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-muted hover:text-text-secondary hover:bg-panel-light'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isDemo && (
          <div className="text-[11px] text-text-muted bg-surface/60 border border-border rounded-md px-3 py-2">
            LP deposit/withdraw is live-mode only. Switch to Live to provide liquidity.
          </div>
        )}

        {/* Pool stats */}
        <div className="space-y-1.5 text-[11px]">
          <PoolStatRow label="Pool Liquidity" value={`$${formatUsd(stats.poolAmount)}`} />
          <PoolStatRow label="Available" value={`$${formatUsd(stats.availableLiquidity)}`} />
          <PoolStatRow label="Utilisation" value={`${stats.utilizationPercent.toFixed(2)}%`} />
          <PoolStatRow label="AUM" value={`$${formatUsd(stats.aum)}`} bold />
        </div>

        {/* Amount input */}
        <div>
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
              {tab === 'deposit' ? 'Deposit USDC' : 'Withdraw PLP'}
            </label>
            <span className="text-[10px] text-text-muted font-mono truncate">
              Bal: {tab === 'deposit'
                ? `$${formatUsd(usdcBalance)}`
                : `${formatUsd(plpBalance)} PLP`}
            </span>
          </div>

          <div className="flex items-center bg-surface border border-border rounded-md focus-within:border-accent/40 transition-colors">
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 min-w-0 bg-transparent font-mono text-sm text-text-primary outline-none px-3 py-2"
            />
            <span className="text-[10px] text-text-muted pr-3 shrink-0">
              {tab === 'deposit' ? 'USDC' : 'PLP'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1 mt-2">
            {[25, 50, 75, 100].map(pct => (
              <button
                key={pct}
                onClick={() => handleQuickFill(pct)}
                className="text-[10px] text-text-muted hover:text-text-primary bg-surface hover:bg-panel-light py-1.5 rounded transition-colors cursor-pointer"
              >
                {pct === 100 ? 'Max' : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Receive preview */}
        {amountNum > 0 && (
          <div className="space-y-1 text-[11px] border-t border-border pt-2.5">
            <PoolStatRow label="You receive" value={youReceive} bold />
            <PoolStatRow label="PLP balance" value={`${formatUsd(plpBalance)} PLP`} muted />
            <PoolStatRow
              label="Share of pool"
              value={
                stats.poolAmount > 0
                  ? `${((amountNum / stats.poolAmount) * 100).toFixed(3)}%`
                  : '—'
              }
              muted
            />
          </div>
        )}

        {/* Status */}
        {isBusy && (
          <LpStatusDisplay status={status} />
        )}
      </div>

      {/* Submit */}
      <div className="p-3 border-t border-border">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isDemo}
          className={cn(
            'w-full py-3 rounded-lg font-semibold text-sm text-white transition-all cursor-pointer',
            'bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent'
          )}
        >
          {isBusy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {status === 'approving' ? 'Approving...' :
               status === 'submitting' ? 'Submitting...' :
               status === 'confirming' ? 'Confirming...' : 'Processing...'}
            </span>
          ) : isDemo ? (
            'Live mode only'
          ) : validation ? (
            <span className="opacity-80">{validation}</span>
          ) : (
            tab === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'
          )}
        </button>
        {/* Hint about MAX uint256 approval */}
        {!isDemo && tab === 'withdraw' && plpBalanceRaw > 0n && (
          <p className="text-[10px] text-text-muted mt-2 text-center">
            First withdrawal requires a one-time PLP approval.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───

interface PoolStatRowProps {
  label: string
  value: string
  bold?: boolean
  muted?: boolean
}

function PoolStatRow({ label, value, bold, muted }: PoolStatRowProps) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-text-muted text-[10px] uppercase tracking-wider">{label}</span>
      <span className={cn(
        'font-mono tabular-nums truncate',
        bold ? 'text-text-primary font-semibold' : muted ? 'text-text-muted' : 'text-text-secondary'
      )}>
        {value}
      </span>
    </div>
  )
}

interface LpStatusDisplayProps {
  status: VaultOpStatus
}

function LpStatusDisplay({ status }: LpStatusDisplayProps) {
  const labels: Record<Exclude<VaultOpStatus, 'idle' | 'success' | 'error'>, string> = {
    approving: 'Approving token...',
    submitting: 'Submitting transaction...',
    confirming: 'Confirming on-chain...',
  }
  const label = labels[status as keyof typeof labels] ?? 'Working...'
  return (
    <div className="border-t border-border pt-3 flex items-center gap-2 text-xs text-accent">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span>{label}</span>
    </div>
  )
}
