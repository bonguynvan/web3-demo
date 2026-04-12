/**
 * FuturesOrderForm — order entry for dated futures positions.
 *
 * Similar to Web3OrderForm but with tenor selection instead of market/limit,
 * and basis rate instead of funding rate.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useTradingStore } from '../../store/tradingStore'
import { usePrices } from '../../hooks/usePrices'
import { useIsDemo } from '../../store/modeStore'
import { useUsdcBalance } from '../../hooks/useTokenBalance'
import { addFuturesPosition, computeBasisRate, TENOR_LABELS } from '../../lib/futuresData'
import { DEMO_ACCOUNT, FEES } from '../../lib/demoData'
import { cn, formatUsd } from '../../lib/format'
import { useToast } from '../../store/toastStore'
import type { FuturesTenor } from '../../types/futures'
import type { OrderSide } from '../../types/trading'

const TENORS: FuturesTenor[] = ['1W', '2W', '1M', '3M']

export function FuturesOrderForm() {
  const { t } = useTranslation('futures')
  const { t: tPerp } = useTranslation('perp')
  const toast = useToast()
  const isDemo = useIsDemo()

  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const { getPrice } = usePrices()
  const { dollars: onChainBalance } = useUsdcBalance()

  const currentPrice = getPrice(selectedMarket.symbol)
  const markPrice = currentPrice?.price ?? 0
  const balance = isDemo ? DEMO_ACCOUNT.balance : (onChainBalance > 0 ? onChainBalance : DEMO_ACCOUNT.balance)

  const [side, setSide] = useState<OrderSide>('long')
  const [tenor, setTenor] = useState<FuturesTenor>('1M')
  const [amount, setAmount] = useState('')
  const [leverage, setLeverage] = useState(5)
  const [submitting, setSubmitting] = useState(false)

  const inputNum = parseFloat(amount) || 0
  const notional = inputNum * leverage
  const { basis, annualized } = computeBasisRate(tenor)

  // Fee preview
  const openFee = notional * FEES.openFeeBps / 10_000
  const spreadCost = markPrice * FEES.spreadBps / 10_000
  const effectiveEntry = side === 'long' ? markPrice + spreadCost : markPrice - spreadCost
  const liqPrice = effectiveEntry > 0 && leverage > 0
    ? side === 'long'
      ? effectiveEntry * (1 - 0.95 / leverage)
      : effectiveEntry * (1 + 0.95 / leverage)
    : 0

  const canSubmit = inputNum > 0 && inputNum <= balance && markPrice > 0 && !submitting

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)

    await new Promise(r => setTimeout(r, 400))

    const result = addFuturesPosition({
      market: selectedMarket.symbol,
      baseAsset: selectedMarket.baseAsset,
      side,
      collateral: inputNum,
      leverage,
      entryPrice: markPrice,
      tenor,
    })

    if (isDemo) {
      DEMO_ACCOUNT.balance -= inputNum
    }

    toast.success(
      t('futures_position_opened', {
        side: side === 'long' ? tPerp('long') : tPerp('short'),
        asset: selectedMarket.baseAsset,
        tenor: TENOR_LABELS[tenor],
      }),
      `$${formatUsd(notional)} at ${leverage}x — Entry $${formatUsd(result.effectiveEntry)}`,
    )

    setAmount('')
    setSubmitting(false)
  }, [canSubmit, selectedMarket, side, inputNum, leverage, markPrice, tenor, notional, isDemo, toast, t, tPerp])

  const handleQuickFill = (pct: number) => {
    setAmount(((balance * pct) / 100).toFixed(2))
  }

  // Validation message
  const validationMsg =
    inputNum <= 0 ? t('enter_amount') :
    inputNum > balance ? t('insufficient_balance') :
    markPrice <= 0 ? tPerp('waiting_for_price') : null

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      {/* Side toggle */}
      <div className="flex p-1.5 gap-1 border-b border-border">
        <button
          onClick={() => setSide('long')}
          className={cn(
            'flex-1 py-2 text-sm font-semibold rounded transition-all cursor-pointer',
            side === 'long' ? 'bg-long text-white shadow-sm' : 'text-text-muted hover:text-text-secondary hover:bg-panel-light',
          )}
        >
          {tPerp('long')}
        </button>
        <button
          onClick={() => setSide('short')}
          className={cn(
            'flex-1 py-2 text-sm font-semibold rounded transition-all cursor-pointer',
            side === 'short' ? 'bg-short text-white shadow-sm' : 'text-text-muted hover:text-text-secondary hover:bg-panel-light',
          )}
        >
          {tPerp('short')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Tenor selector */}
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1.5">{t('tenor')}</div>
          <div className="grid grid-cols-4 gap-1">
            {TENORS.map(t_tenor => (
              <button
                key={t_tenor}
                onClick={() => setTenor(t_tenor)}
                className={cn(
                  'py-2 text-xs font-medium rounded transition-colors cursor-pointer',
                  tenor === t_tenor
                    ? 'bg-accent-dim text-accent border border-accent/30'
                    : 'bg-surface text-text-muted hover:text-text-primary border border-transparent',
                )}
              >
                {t_tenor}
              </button>
            ))}
          </div>
        </div>

        {/* Amount input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">{tPerp('collateral')}</span>
            <span className="text-[10px] text-text-muted font-mono">Bal: ${formatUsd(balance)}</span>
          </div>
          <div className="flex items-center bg-surface border border-border rounded-md focus-within:border-accent/40 transition-colors">
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 min-w-0 bg-transparent font-mono text-sm text-text-primary outline-none px-3 py-2"
            />
            <span className="text-[10px] text-text-muted pr-3">USDC</span>
          </div>
          <div className="grid grid-cols-5 gap-1 mt-2">
            {[10, 25, 50, 75, 100].map(pct => (
              <button
                key={pct}
                onClick={() => handleQuickFill(pct)}
                className="text-[10px] text-text-muted hover:text-text-primary bg-surface hover:bg-panel-light py-1.5 rounded transition-colors cursor-pointer"
              >
                {pct === 100 ? tPerp('common:max') : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Leverage */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">{tPerp('leverage')}</span>
            <span className="text-sm font-mono text-accent font-semibold">{leverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            value={leverage}
            onChange={e => setLeverage(Number(e.target.value))}
            className="w-full accent-accent h-1 cursor-pointer"
          />
        </div>

        {/* Order summary */}
        {inputNum > 0 && markPrice > 0 && (
          <div className="space-y-1 text-[11px] border-t border-border pt-2.5">
            <SummaryRow label={tPerp('position_size')} value={`$${formatUsd(notional)}`} bold />
            <SummaryRow label={tPerp('entry_price')} value={`$${formatUsd(effectiveEntry)}`} />
            <SummaryRow label={tPerp('liq_price')} value={`$${formatUsd(liqPrice)}`} className="text-short" />
            <SummaryRow label={t('basis_rate')} value={`${(annualized * 100).toFixed(2)}% ann.`} />
            <SummaryRow label={t('expiry')} value={TENOR_LABELS[tenor]} />
            <SummaryRow label={tPerp('fee')} value={`-$${formatUsd(openFee)}`} muted />
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="p-3 border-t border-border">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'w-full py-3 rounded-lg font-semibold text-sm text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
            side === 'long' ? 'bg-long hover:bg-long/90' : 'bg-short hover:bg-short/90',
          )}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {tPerp('executing')}
            </span>
          ) : validationMsg ? (
            <span className="opacity-80">{validationMsg}</span>
          ) : (
            `${side === 'long' ? tPerp('long') : tPerp('short')} ${selectedMarket.baseAsset} ${tenor}`
          )}
        </button>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, muted, bold, className }: {
  label: string; value: string; muted?: boolean; bold?: boolean; className?: string
}) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-text-muted text-[10px] uppercase tracking-wider">{label}</span>
      <span className={cn(
        'font-mono tabular-nums',
        bold ? 'text-sm font-medium text-text-primary' : 'text-xs text-text-secondary',
        muted && 'text-text-muted',
        className,
      )}>
        {value}
      </span>
    </div>
  )
}
