/**
 * LeverageForm — one-click leveraged long/short via Aave + 0x.
 *
 * Renders as a collapsible section within MarginPanel.
 * Combines Aave supply/borrow with 0x swap in a multi-step flow.
 */

import { useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { TrendingUp, TrendingDown, Loader2, Check, AlertTriangle } from 'lucide-react'
import { useLeverageLoop, type LeverageDirection, type LeverageStep } from '../../hooks/useLeverageLoop'
import { useErc20Balance } from '../../hooks/useErc20Balance'
import { formatTokenAmount, isValidAmount } from '../../lib/spotUtils'
import { ARBITRUM_CHAIN_ID, ARBITRUM_WETH, ARBITRUM_USDC } from '../../lib/spotConstants'
import { cn } from '../../lib/format'

export function LeverageForm() {
  const { t } = useTranslation('margin')
  const { isConnected } = useAccount()
  const chainId = useChainId()

  const [direction, setDirection] = useState<LeverageDirection>('long')
  const [amount, setAmount] = useState('')
  const [leverage, setLeverage] = useState(2.0)

  const { step, error, progress, executeLeverage, isBusy } = useLeverageLoop()

  // Collateral token depends on direction
  const collateralToken = direction === 'long' ? ARBITRUM_WETH : ARBITRUM_USDC
  const { raw: balance, formatted: balanceFormatted } = useErc20Balance({
    tokenAddress: collateralToken.address,
    decimals: collateralToken.decimals,
    chainId: ARBITRUM_CHAIN_ID,
  })

  const handleSubmit = () => {
    executeLeverage(direction, amount, leverage)
  }

  const handleMax = () => {
    if (balance > 0n) {
      setAmount(formatTokenAmount(balance, collateralToken.decimals, collateralToken.decimals))
    }
  }

  const isWrongChain = chainId !== ARBITRUM_CHAIN_ID
  const buttonDisabled = isBusy || isWrongChain || !isConnected || !isValidAmount(amount)

  return (
    <div className="space-y-3">
      {/* Direction toggle */}
      <div className="flex gap-1 bg-surface rounded-md p-0.5">
        <button
          onClick={() => setDirection('long')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded transition-colors cursor-pointer',
            direction === 'long'
              ? 'bg-long text-white shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          {t('perp:long')} ETH
        </button>
        <button
          onClick={() => setDirection('short')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded transition-colors cursor-pointer',
            direction === 'short'
              ? 'bg-short text-white shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          {t('perp:short')} ETH
        </button>
      </div>

      {/* Collateral input */}
      <div className="bg-surface rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">
            {t('collateral')} ({collateralToken.symbol})
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
            {t('balance')}: <span className="font-mono">{balanceFormatted}</span>
            <button onClick={handleMax} className="text-accent font-medium cursor-pointer">
              {t('max')}
            </button>
          </div>
        </div>
        <input
          type="text"
          inputMode="decimal"
          maxLength={30}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.0"
          className="w-full bg-transparent text-xl font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none"
        />
      </div>

      {/* Leverage slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('perp:leverage')}</span>
          <span className="text-sm font-mono text-accent font-semibold">{leverage.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min={1.5}
          max={3.0}
          step={0.1}
          value={leverage}
          onChange={e => setLeverage(Number(e.target.value))}
          className="w-full accent-accent h-1 cursor-pointer"
        />
        <div className="flex justify-between text-[9px] text-text-muted mt-1">
          <span>1.5x</span>
          <span>2.0x</span>
          <span>2.5x</span>
          <span>3.0x</span>
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 px-2.5 py-2 bg-amber-400/10 border border-amber-400/30 rounded text-[10px] text-amber-400 leading-relaxed">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Leverage requires multiple transactions (supply → borrow → swap → re-supply).
          Each step costs gas. You can stop at any point and your Aave position remains valid.
        </span>
      </div>

      {/* Progress */}
      {step !== 'idle' && step !== 'error' && (
        <LeverageProgress step={step} progress={progress} />
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-short bg-short/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={buttonDisabled}
        className={cn(
          'w-full py-3 rounded-lg font-semibold text-sm transition-colors cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          step === 'success' ? 'bg-long text-white' :
          direction === 'long' ? 'bg-long text-white hover:bg-long/90' :
          'bg-short text-white hover:bg-short/90',
        )}
      >
        {step === 'success' ? t('complete') :
         isBusy ? progress :
         !isConnected ? t('connect_wallet_margin') :
         isWrongChain ? t('switch_to_arbitrum') :
         !isValidAmount(amount) ? t('enter_amount') :
         `${direction === 'long' ? t('perp:long') : t('perp:short')} ETH ${leverage.toFixed(1)}x`}
      </button>
    </div>
  )
}

function LeverageProgress({ step, progress }: { step: LeverageStep; progress: string }) {
  const steps: { key: LeverageStep; label: string }[] = [
    { key: 'supplying-initial', label: 'Supplying collateral' },
    { key: 'borrowing', label: 'Borrowing' },
    { key: 'approving-swap', label: 'Approving swap' },
    { key: 'swapping', label: 'Swapping via 0x' },
    { key: 'supplying-loop', label: 'Re-supplying' },
    { key: 'success', label: 'Complete' },
  ]

  return (
    <div className="space-y-1">
      {steps.map(s => {
        const stepIndex = steps.findIndex(x => x.key === s.key)
        const currentIndex = steps.findIndex(x => x.key === step)
        const isActive = s.key === step
        const isDone = stepIndex < currentIndex || step === 'success'

        return (
          <div key={s.key} className="flex items-center gap-2 text-xs">
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
              {s.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
