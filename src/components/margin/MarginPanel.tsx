/**
 * MarginPanel — Aave V3 supply/borrow/repay/withdraw form.
 *
 * Layout:
 *  [Supply] [Borrow] [Repay] [Withdraw]   ← action tabs
 *  [Asset selector: USDC ▾]                ← supported tokens
 *  [Amount input]         Bal: X.XX [Max]
 *  ─────────────────────────────────────
 *  [Health Factor: 1.85 → 1.42]           ← preview
 *  ─────────────────────────────────────
 *  [    Supply USDC    ]                   ← submit
 *  ─────────────────────────────────────
 *  [Position summary card]                 ← current Aave position
 */

import { useState, useCallback } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { Loader2, Check, ChevronDown } from 'lucide-react'
import { useMarginStore } from '../../store/marginStore'
import { useMarginExecution } from '../../hooks/useMarginExecution'
import { useAavePositions } from '../../hooks/useAavePositions'
import { useErc20Balance } from '../../hooks/useErc20Balance'
import { formatTokenAmount, isValidAmount, parseTokenAmount } from '../../lib/spotUtils'
import { ARBITRUM_CHAIN_ID } from '../../lib/spotConstants'
import { MARGIN_SUPPORTED_TOKENS } from '../../lib/aaveConstants'
import { cn } from '../../lib/format'
import { HealthFactorGauge } from './HealthFactorGauge'
import { MarginPositionCard } from './MarginPositionCard'
import type { MarginAction, MarginStatus } from '../../types/margin'
import type { Token } from '../../types/spot'

const ACTIONS: MarginAction[] = ['supply', 'borrow', 'repay', 'withdraw']

export function MarginPanel() {
  const { t } = useTranslation('margin')
  const { isConnected } = useAccount()
  const chainId = useChainId()

  const { action, selectedAsset, amount, setAction, setSelectedAsset, setAmount } = useMarginStore()
  const { status, error: execError, execute } = useMarginExecution()
  const { summary } = useAavePositions()

  const { raw: assetBalance, formatted: assetBalanceFormatted } = useErc20Balance({
    tokenAddress: selectedAsset.address,
    decimals: selectedAsset.decimals,
    chainId: ARBITRUM_CHAIN_ID,
  })

  const [showAssetPicker, setShowAssetPicker] = useState(false)

  const handleMax = useCallback(() => {
    if (assetBalance > 0n) {
      setAmount(formatTokenAmount(assetBalance, selectedAsset.decimals, selectedAsset.decimals))
    }
  }, [assetBalance, selectedAsset, setAmount])

  const handleSubmit = useCallback(() => {
    execute(action, selectedAsset, amount)
  }, [execute, action, selectedAsset, amount])

  const buttonLabel = getButtonLabel({ isConnected, chainId, action, amount, assetBalance, selectedAsset, status, t })
  const buttonDisabled = status !== 'idle' && status !== 'error' && status !== 'success'
  const isWrongChain = chainId !== ARBITRUM_CHAIN_ID

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ─── Action tabs ─── */}
        <div className="flex gap-0.5 bg-surface rounded-md p-0.5">
          {ACTIONS.map(a => (
            <button
              key={a}
              onClick={() => setAction(a)}
              className={cn(
                'flex-1 py-1.5 text-[10px] font-medium rounded capitalize transition-colors cursor-pointer',
                action === a
                  ? 'bg-panel-light text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {t(a)}
            </button>
          ))}
        </div>

        {/* ─── Asset selector ─── */}
        <div className="relative">
          <button
            onClick={() => setShowAssetPicker(!showAssetPicker)}
            className="flex items-center justify-between w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-sm cursor-pointer hover:bg-panel-light transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] text-accent font-bold">
                {selectedAsset.symbol[0]}
              </div>
              <span className="font-medium text-text-primary">{selectedAsset.symbol}</span>
              <span className="text-[10px] text-text-muted">{selectedAsset.name}</span>
            </div>
            <ChevronDown className="w-4 h-4 text-text-muted" />
          </button>

          {showAssetPicker && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-panel border border-border rounded-lg shadow-lg z-20 overflow-hidden">
              {MARGIN_SUPPORTED_TOKENS.map(token => (
                <button
                  key={token.address}
                  onClick={() => { setSelectedAsset(token); setShowAssetPicker(false) }}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-panel-light transition-colors cursor-pointer',
                    token.address === selectedAsset.address && 'bg-panel-light',
                  )}
                >
                  <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[9px] text-accent font-bold">
                    {token.symbol[0]}
                  </div>
                  <span className="font-medium text-text-primary">{token.symbol}</span>
                  <span className="text-[10px] text-text-muted">{token.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── Amount input ─── */}
        <div className="bg-surface rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">{t(action)}</span>
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              {t('balance')}: <span className="font-mono">{assetBalanceFormatted}</span>
              <button
                onClick={handleMax}
                className="text-accent hover:text-accent/80 font-medium cursor-pointer"
              >
                {t('max')}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              maxLength={30}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.0"
              className="flex-1 bg-transparent text-xl font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none min-w-0"
            />
            <span className="text-sm font-medium text-text-muted">{selectedAsset.symbol}</span>
          </div>
        </div>

        {/* ─── Health Factor preview ─── */}
        {summary && summary.totalCollateralUSD > 0 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-text-muted">{t('health_factor')}</span>
            <HealthFactorGauge healthFactor={summary.healthFactor} compact />
          </div>
        )}

        {/* ─── Error ─── */}
        {execError && (
          <div className="text-xs text-short bg-short/10 rounded-lg px-3 py-2">
            {execError}
          </div>
        )}

        {/* ─── Status ─── */}
        {status !== 'idle' && status !== 'error' && (
          <MarginStatusDisplay status={status} t={t} />
        )}

        {/* ─── Position card ─── */}
        <div className="border-t border-border pt-3">
          <MarginPositionCard />
        </div>
      </div>

      {/* ─── Submit ─── */}
      <div className="p-3 pt-0">
        <button
          onClick={handleSubmit}
          disabled={buttonDisabled || isWrongChain || !isConnected}
          className={cn(
            'w-full py-3 rounded-lg font-semibold text-sm transition-colors cursor-pointer',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            status === 'success'
              ? 'bg-long text-white'
              : status === 'error'
                ? 'bg-short text-white'
                : 'bg-accent text-white hover:bg-accent/90',
          )}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}

function MarginStatusDisplay({ status, t }: { status: MarginStatus; t: (k: string) => string }) {
  const steps: { key: MarginStatus; label: string }[] = [
    { key: 'approving', label: t('approving_token') },
    { key: 'submitting', label: t('submitting_tx') },
    { key: 'confirming', label: t('confirming') },
    { key: 'success', label: t('complete') },
  ]

  return (
    <div className="space-y-1">
      {steps.map(step => {
        const stepIndex = steps.findIndex(s => s.key === step.key)
        const currentIndex = steps.findIndex(s => s.key === status)
        const isActive = step.key === status
        const isDone = stepIndex < currentIndex || status === 'success'

        return (
          <div key={step.key} className="flex items-center gap-2 text-xs">
            {isDone ? (
              <Check className="w-3.5 h-3.5 text-long" />
            ) : isActive ? (
              <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-border" />
            )}
            <span className={cn(
              isDone ? 'text-text-secondary' : isActive ? 'text-text-primary' : 'text-text-muted',
            )}>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function getButtonLabel({
  isConnected, chainId, action, amount, assetBalance, selectedAsset, status, t,
}: {
  isConnected: boolean
  chainId: number
  action: MarginAction
  amount: string
  assetBalance: bigint
  selectedAsset: Token
  status: MarginStatus
  t: (key: string) => string
}): string {
  if (!isConnected) return t('connect_wallet_margin')
  if (chainId !== ARBITRUM_CHAIN_ID) return t('switch_to_arbitrum')
  if (status === 'success') return t(`${action}_successful`)
  if (status === 'error') return t('try_again')
  if (status !== 'idle') return `${t(action)}...`
  if (!isValidAmount(amount)) return t('enter_amount')

  if (action === 'supply' || action === 'repay') {
    const required = parseTokenAmount(amount, selectedAsset.decimals)
    if (required > assetBalance) return t('insufficient_balance')
  }

  return `${t(action)} ${selectedAsset.symbol}`
}
