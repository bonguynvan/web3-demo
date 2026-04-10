/**
 * Web3OrderForm — order entry with on-chain execution or demo mode.
 *
 * Layout:
 *  [Long] [Short]                  ← side toggle
 *  [Market] [Limit]                ← order type
 *  [Limit Price input]             ← only for limit
 *  Pay with [USDC] [ETH]           ← amount unit
 *  [Amount input]      Bal: $X
 *  [10] [25] [50] [75] [Max]       ← quick fill
 *  Leverage  ●━━━━━━  10x          ← slider
 *  [1x] [2x] [5x] [10x] [20x]      ← presets
 *  ▾ Advanced (TP/SL, Reduce Only) ← collapsed by default
 *  ─────────────────────────────────
 *  Position Size       $10,000
 *  Entry / Liq Price   $3,500/3,150
 *  Fee                 -$10.00
 *  ─────────────────────────────────
 *  [    Long ETH    ]              ← submit button
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Loader2, Check, X, ChevronDown, Keyboard } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { useUsdcBalance } from '../hooks/useTokenBalance'
import { usePrices } from '../hooks/usePrices'
import { useTradeExecution, type TradeStatus } from '../hooks/useTradeExecution'
import { useOrderFormShortcuts } from '../hooks/useOrderFormShortcuts'
import { getContracts, getMarkets } from '../lib/contracts'
import { cn, formatUsd } from '../lib/format'
import { useToast } from '../store/toastStore'
import { useIsDemo } from '../store/modeStore'
import { addDemoPosition, addDemoPendingLimit, DEMO_ACCOUNT, FEES } from '../lib/demoData'
import { Tooltip } from './ui/Tooltip'
import { Dropdown } from './ui/Dropdown'
import { HighLeverageRiskModal, HIGH_LEVERAGE_THRESHOLD } from './HighLeverageRiskModal'
import { useSettingsStore } from '../store/settingsStore'

type AmountUnit = 'usdc' | 'coin'

export function Web3OrderForm() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const toast = useToast()
  const isDemo = useIsDemo()

  const {
    orderSide, orderType, leverage, orderPrice, orderSize,
    setOrderSide, setOrderType, setLeverage, setOrderPrice, setOrderSize,
    selectedMarket,
  } = useTradingStore()

  const { dollars: onChainBalance } = useUsdcBalance()
  const { getPrice } = usePrices()
  const { status, error, lastTxHash, increasePosition, needsApproval } = useTradeExecution()

  // MT4-style hotkeys: B/S long/short, M/L market/limit, 1-5 leverage,
  // Esc clears the form. Suppressed while a text input is focused.
  useOrderFormShortcuts()

  const currentPrice = getPrice(selectedMarket.symbol)
  const markPrice = currentPrice?.price ?? 0
  const balance = isDemo ? DEMO_ACCOUNT.balance : (onChainBalance > 0 ? onChainBalance : DEMO_ACCOUNT.balance)

  // Resolve index token (live mode)
  let indexToken: `0x${string}` | undefined
  try {
    const contracts = getContracts(chainId)
    const markets = getMarkets(contracts.addresses)
    indexToken = markets.find(m => m.symbol === selectedMarket.symbol)?.indexToken
  } catch {}

  // ─── Amount unit toggle ───
  const [amountUnit, setAmountUnit] = useState<AmountUnit>('usdc')

  // ─── Computed values ───
  const inputNum = parseFloat(orderSize) || 0
  const priceNum = orderType === 'market' ? markPrice : (parseFloat(orderPrice) || markPrice)

  // Convert input to collateral USD based on unit
  // USDC: input is collateral directly
  // COIN: input is the coin amount → collateral = (input × price) / leverage
  const collateralNum = amountUnit === 'usdc'
    ? inputNum
    : (priceNum > 0 && leverage > 0 ? (inputNum * priceNum) / leverage : 0)

  const notional = collateralNum * leverage
  const coinAmount = priceNum > 0 ? notional / priceNum : 0

  // Fee breakdown
  const openFee = notional * FEES.openFeeBps / 10_000
  const spreadCost = priceNum * FEES.spreadBps / 10_000
  const effectiveEntry = orderSide === 'long' ? priceNum + spreadCost : priceNum - spreadCost
  const liqPrice = effectiveEntry > 0 && leverage > 0
    ? orderSide === 'long'
      ? effectiveEntry * (1 - 0.95 / leverage)
      : effectiveEntry * (1 + 0.95 / leverage)
    : 0

  const leveragePresets = [1, 2, 5, 10, 20]

  // ─── Advanced (TP/SL, Reduce Only) ───
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [tpPrice, setTpPrice] = useState('')
  const [slPrice, setSlPrice] = useState('')
  const [reduceOnly, setReduceOnly] = useState(false)
  const [demoSubmitting, setDemoSubmitting] = useState(false)
  const [riskModalOpen, setRiskModalOpen] = useState(false)
  const hideRiskWarning = useSettingsStore(s => s.hideHighLeverageRiskWarning)

  const tpNum = parseFloat(tpPrice) || 0
  const slNum = parseFloat(slPrice) || 0
  const tpPnl = tpNum > 0 && priceNum > 0 && notional > 0
    ? (orderSide === 'long' ? (tpNum - priceNum) / priceNum : (priceNum - tpNum) / priceNum) * notional
    : 0
  const slPnl = slNum > 0 && priceNum > 0 && notional > 0
    ? (orderSide === 'long' ? (slNum - priceNum) / priceNum : (priceNum - slNum) / priceNum) * notional
    : 0
  const tpRoi = collateralNum > 0 ? (tpPnl / collateralNum) * 100 : 0
  const slRoi = collateralNum > 0 ? (slPnl / collateralNum) * 100 : 0

  // ─── Status tracking ───
  const prevStatusRef = useRef(status)
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      if (status === 'success') {
        const title = `${orderSide === 'long' ? 'Long' : 'Short'} ${selectedMarket.baseAsset} opened`
        const detail = `$${formatUsd(notional)} at ${leverage}x`
        // Show the receipt link when we have a tx hash (live mode); fall
        // back to a plain success toast in demo mode where there's no tx.
        if (lastTxHash) {
          toast.successWithTx(title, detail, lastTxHash)
        } else {
          toast.success(title, detail)
        }
        setOrderSize('')
      } else if (status === 'error' && error) {
        toast.error('Trade failed', error)
      }
    }
    prevStatusRef.current = status
  }, [status, error, lastTxHash, orderSide, selectedMarket.baseAsset, notional, leverage, setOrderSize, toast])

  // ─── Submit handler ───
  // Two-stage:
  //   handleSubmitOrder = entry point. Checks gates (high-leverage warning).
  //                       If a gate fires, defers to a modal that calls executeSubmit on confirm.
  //   executeSubmit     = the actual order placement logic. Bypasses gates.
  const executeSubmit = useCallback(async () => {
    if (collateralNum <= 0 || priceNum <= 0) return

    // ─── Limit orders: store off-chain pending ───
    // Neither the contracts nor the demo store support automatic triggering
    // yet. We persist the order in the client-side pending list so it
    // renders on the chart and in the Orders tab, and the user can cancel
    // it. Execution remains manual — when/if we wire a keeper loop it
    // picks up from the same store.
    if (orderType === 'limit') {
      const limitPriceNum = parseFloat(orderPrice)
      if (!Number.isFinite(limitPriceNum) || limitPriceNum <= 0) {
        toast.error('Invalid limit price', 'Enter a positive price')
        return
      }

      addDemoPendingLimit({
        market: selectedMarket.symbol,
        side: orderSide,
        triggerPrice: limitPriceNum,
        sizeUsd: notional,
        leverage,
        collateralUsd: collateralNum,
      })

      toast.success(
        'Limit order placed',
        `${orderSide === 'long' ? 'Long' : 'Short'} ${selectedMarket.baseAsset} $${formatUsd(notional)} @ $${formatUsd(limitPriceNum)} — pending`,
      )
      setOrderSize('')
      setOrderPrice('')
      return
    }

    // ─── Market orders: execute immediately ───
    if (!isDemo && isConnected && indexToken && currentPrice) {
      await increasePosition({
        indexToken,
        collateralUsd: collateralNum,
        sizeUsd: notional,
        isLong: orderSide === 'long',
        currentPriceRaw: currentPrice.raw,
      })
      return
    }

    // Demo mode — market fill
    setDemoSubmitting(true)
    await new Promise(r => setTimeout(r, 500))

    const result = addDemoPosition({
      key: `${selectedMarket.symbol}-${orderSide}-${Date.now()}`,
      market: selectedMarket.symbol,
      baseAsset: selectedMarket.baseAsset,
      side: orderSide,
      collateral: collateralNum,
      leverage,
      entryPrice: priceNum,
      tp: tpNum > 0 ? tpNum : undefined,
      sl: slNum > 0 ? slNum : undefined,
    })

    toast.success(
      `${orderSide === 'long' ? 'Long' : 'Short'} ${selectedMarket.baseAsset} opened`,
      `$${formatUsd(notional)} at ${leverage}x • Entry $${formatUsd(result.effectiveEntry)}`
    )
    setOrderSize('')
    setTpPrice('')
    setSlPrice('')
    setDemoSubmitting(false)
  }, [
    collateralNum, priceNum, orderType, orderPrice, isDemo, isConnected,
    indexToken, currentPrice, increasePosition, notional, orderSide,
    selectedMarket.symbol, selectedMarket.baseAsset, leverage, tpNum, slNum,
    setOrderSize, setOrderPrice, toast,
  ])

  /** Public entry point — checks the high-leverage gate, then defers to executeSubmit. */
  const handleSubmitOrder = useCallback(() => {
    if (collateralNum <= 0 || priceNum <= 0) return

    // Gate: high leverage trades show a one-time risk modal unless dismissed.
    if (leverage >= HIGH_LEVERAGE_THRESHOLD && !hideRiskWarning) {
      setRiskModalOpen(true)
      return
    }

    void executeSubmit()
  }, [collateralNum, priceNum, leverage, hideRiskWarning, executeSubmit])

  // Approximate liquidation buffer at the current leverage — used by the
  // risk modal headline. Mirrors the formula in addDemoPosition / liq calc.
  const liqBufferPctAtLeverage = leverage > 0 ? (0.95 / leverage) * 100 : 0

  const isSubmitting = demoSubmitting || (status !== 'idle' && status !== 'success' && status !== 'error')

  // ─── Validation ───
  const canSubmit = collateralNum > 0 && priceNum > 0 && !isSubmitting && collateralNum <= balance
  const validationMsg =
    collateralNum <= 0 ? 'Enter amount' :
    collateralNum > balance ? 'Insufficient balance' :
    priceNum <= 0 ? 'Waiting for price...' : null

  // Show "Approve USDC then Long" only in live mode when allowance is too low.
  const requiresApproval = !isDemo && isConnected && collateralNum > 0 && needsApproval(collateralNum)

  // Quick-fill: set input value based on percentage of balance
  const handleQuickFill = (pct: number) => {
    if (amountUnit === 'usdc') {
      setOrderSize(((balance * pct) / 100).toFixed(2))
    } else {
      // For coin mode: max coin amount = (balance × leverage) / price
      const maxCoin = priceNum > 0 ? (balance * leverage) / priceNum : 0
      setOrderSize(((maxCoin * pct) / 100).toFixed(4))
    }
  }

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      {/* Side Toggle + keyboard cheat sheet */}
      <div className="flex p-1.5 gap-1 border-b border-border items-center">
        <button
          onClick={() => setOrderSide('long')}
          className={cn(
            'flex-1 py-2 text-sm font-semibold rounded transition-all cursor-pointer',
            orderSide === 'long'
              ? 'bg-long text-white shadow-sm'
              : 'text-text-muted hover:text-text-secondary hover:bg-panel-light'
          )}
        >
          Long
        </button>
        <button
          onClick={() => setOrderSide('short')}
          className={cn(
            'flex-1 py-2 text-sm font-semibold rounded transition-all cursor-pointer',
            orderSide === 'short'
              ? 'bg-short text-white shadow-sm'
              : 'text-text-muted hover:text-text-secondary hover:bg-panel-light'
          )}
        >
          Short
        </button>
        <KeyboardShortcutsButton />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Order Type */}
        <div className="flex gap-1 bg-surface rounded p-0.5">
          {(['market', 'limit'] as const).map(type => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={cn(
                'flex-1 py-1.5 text-xs font-medium rounded capitalize transition-colors cursor-pointer',
                orderType === type ? 'bg-panel-light text-text-primary' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Limit Price */}
        {orderType === 'limit' && (
          <FieldGroup label="Limit Price">
            <div className="flex items-center bg-surface border border-border rounded-md focus-within:border-accent/40 transition-colors">
              <input
                type="number"
                value={orderPrice}
                onChange={e => setOrderPrice(e.target.value)}
                placeholder={markPrice > 0 ? markPrice.toFixed(2) : '0.00'}
                className="flex-1 min-w-0 bg-transparent font-mono text-sm text-text-primary outline-none px-3 py-2"
              />
              <span className="text-[10px] text-text-muted pr-3 shrink-0">USD</span>
            </div>
          </FieldGroup>
        )}

        {/* Pay With Toggle */}
        <FieldGroup
          label="Pay with"
          right={
            <span className="text-[10px] text-text-muted font-mono truncate">
              Bal: ${formatUsd(balance)}
            </span>
          }
        >
          <div className="flex gap-1 bg-surface rounded p-0.5 mb-2">
            <button
              onClick={() => { setAmountUnit('usdc'); setOrderSize('') }}
              className={cn(
                'flex-1 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer',
                amountUnit === 'usdc' ? 'bg-panel-light text-text-primary' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              USDC
            </button>
            <button
              onClick={() => { setAmountUnit('coin'); setOrderSize('') }}
              className={cn(
                'flex-1 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer',
                amountUnit === 'coin' ? 'bg-panel-light text-text-primary' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {selectedMarket.baseAsset}
            </button>
          </div>

          <div className="flex items-center bg-surface border border-border rounded-md focus-within:border-accent/40 transition-colors">
            <input
              type="number"
              value={orderSize}
              onChange={e => setOrderSize(e.target.value)}
              placeholder="0.00"
              className="flex-1 min-w-0 bg-transparent font-mono text-sm text-text-primary outline-none px-3 py-2"
            />
            <span className="text-[10px] text-text-muted pr-3 shrink-0">
              {amountUnit === 'usdc' ? 'USDC' : selectedMarket.baseAsset}
            </span>
          </div>

          {/* Quick fill buttons */}
          <div className="grid grid-cols-5 gap-1 mt-2">
            {[10, 25, 50, 75, 100].map(pct => (
              <button
                key={pct}
                onClick={() => handleQuickFill(pct)}
                className="text-[10px] text-text-muted hover:text-text-primary bg-surface hover:bg-panel-light py-2 md:py-1.5 rounded transition-colors cursor-pointer min-h-[32px] md:min-h-0"
              >
                {pct === 100 ? 'Max' : `${pct}%`}
              </button>
            ))}
          </div>

          {/* Conversion preview */}
          {inputNum > 0 && priceNum > 0 && (
            <div className="text-[10px] text-text-muted mt-1.5 font-mono">
              {amountUnit === 'usdc'
                ? `≈ ${coinAmount.toFixed(4)} ${selectedMarket.baseAsset}`
                : `≈ $${formatUsd(collateralNum)} collateral`}
            </div>
          )}
        </FieldGroup>

        {/* Leverage */}
        <FieldGroup
          label="Leverage"
          right={<span className="text-sm font-mono text-accent font-semibold">{leverage}x</span>}
        >
          <input
            type="range"
            min={1}
            max={20}
            value={leverage}
            onChange={e => setLeverage(Number(e.target.value))}
            className="w-full accent-accent h-1 cursor-pointer"
          />
          <div className="grid grid-cols-5 gap-1 mt-2">
            {leveragePresets.map(l => (
              <button
                key={l}
                onClick={() => setLeverage(l)}
                className={cn(
                  'text-[10px] py-2 md:py-1.5 rounded transition-colors cursor-pointer font-medium min-h-[32px] md:min-h-0',
                  leverage === l
                    ? 'bg-accent-dim text-accent'
                    : 'text-text-muted bg-surface hover:bg-panel-light'
                )}
              >
                {l}x
              </button>
            ))}
          </div>
        </FieldGroup>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className={cn(
            'flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer w-full',
            showAdvanced ? 'text-accent' : 'text-text-muted hover:text-text-primary'
          )}
        >
          <ChevronDown className={cn('w-3 h-3 transition-transform', showAdvanced && 'rotate-180')} />
          Advanced
        </button>

        {/* Advanced section */}
        {showAdvanced && (
          <div className="space-y-2.5 bg-surface/50 rounded-lg p-3">
            {/* Reduce Only */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px] text-text-secondary">Reduce Only</span>
              <input
                type="checkbox"
                checked={reduceOnly}
                onChange={e => setReduceOnly(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent cursor-pointer"
              />
            </label>

            {/* Take Profit */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-long uppercase tracking-wider font-semibold">Take Profit</label>
                {tpPnl !== 0 && (
                  <span className={cn('text-[10px] font-mono', tpPnl >= 0 ? 'text-long' : 'text-short')}>
                    {tpPnl >= 0 ? '+' : ''}${formatUsd(tpPnl)} ({tpRoi >= 0 ? '+' : ''}{tpRoi.toFixed(1)}%)
                  </span>
                )}
              </div>
              <input
                type="number"
                value={tpPrice}
                onChange={e => setTpPrice(e.target.value)}
                placeholder={priceNum > 0 ? formatUsd(priceNum * (orderSide === 'long' ? 1.05 : 0.95)) : '0.00'}
                className="w-full bg-surface border border-long/20 rounded-md px-3 py-1.5 font-mono text-xs text-text-primary outline-none focus:border-long/50 transition-colors"
              />
            </div>

            {/* Stop Loss */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-short uppercase tracking-wider font-semibold">Stop Loss</label>
                {slPnl !== 0 && (
                  <span className={cn('text-[10px] font-mono', slPnl >= 0 ? 'text-long' : 'text-short')}>
                    {slPnl >= 0 ? '+' : ''}${formatUsd(slPnl)} ({slRoi >= 0 ? '+' : ''}{slRoi.toFixed(1)}%)
                  </span>
                )}
              </div>
              <input
                type="number"
                value={slPrice}
                onChange={e => setSlPrice(e.target.value)}
                placeholder={priceNum > 0 ? formatUsd(priceNum * (orderSide === 'long' ? 0.95 : 1.05)) : '0.00'}
                className="w-full bg-surface border border-short/20 rounded-md px-3 py-1.5 font-mono text-xs text-text-primary outline-none focus:border-short/50 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Order Summary — compact */}
        {collateralNum > 0 && priceNum > 0 && (
          <div className="space-y-1 text-[11px] border-t border-border pt-2.5">
            <SummaryRow
              label="Position Size"
              value={`$${formatUsd(notional)}`}
              bold
              tooltip={{
                title: 'Position size',
                content: 'Total notional exposure: collateral × leverage. Your profit and loss scale with this number, not just your collateral.',
              }}
            />
            <SummaryRow label="Collateral" value={`$${formatUsd(collateralNum)}`} />
            <SummaryRow label="Entry Price" value={`$${formatUsd(effectiveEntry)}`} />
            <SummaryRow
              label="Liq. Price"
              value={`$${formatUsd(liqPrice)}`}
              className="text-short"
              tooltip={{
                title: 'Liquidation price',
                content: 'If the mark price reaches this level, your position will be force-closed by the keeper and you lose your collateral. Higher leverage = closer liq price.',
              }}
            />
            <SummaryRow
              label="Fee"
              value={`-$${formatUsd(openFee)}`}
              muted
              tooltip={{
                title: 'Open fee',
                content: 'Charged at entry, deducted from your collateral. A symmetric close fee applies when you exit. Both default to 0.1% of position size.',
              }}
            />
          </div>
        )}

        {/* Trade Status */}
        {status !== 'idle' && status !== 'success' && status !== 'error' && (
          <TradeStatusDisplay status={status} error={error} />
        )}
      </div>

      {/* Submit Button */}
      <div className="p-3 border-t border-border">
        <button
          onClick={handleSubmitOrder}
          disabled={!canSubmit}
          className={cn(
            'w-full py-3 rounded-lg font-semibold text-sm text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
            orderSide === 'long'
              ? 'bg-long hover:bg-long/90 disabled:hover:bg-long'
              : 'bg-short hover:bg-short/90 disabled:hover:bg-short'
          )}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {demoSubmitting ? 'Executing...' :
               status === 'approving' ? 'Approving USDC...' :
               status === 'simulating' ? 'Checking...' :
               status === 'submitting' ? 'Submitting...' :
               status === 'confirming' ? 'Confirming...' : 'Processing...'}
            </span>
          ) : validationMsg ? (
            <span className="opacity-80">{validationMsg}</span>
          ) : requiresApproval ? (
            `Approve USDC then ${orderSide === 'long' ? 'Long' : 'Short'} ${selectedMarket.baseAsset}`
          ) : (
            `${orderSide === 'long' ? 'Long' : 'Short'} ${selectedMarket.baseAsset}`
          )}
        </button>
      </div>

      {/* High-leverage risk modal — gates the actual submit until the user
          confirms once. After "don't show again" is checked, the gate flips
          off via the settings store and this never re-mounts. */}
      <HighLeverageRiskModal
        open={riskModalOpen}
        leverage={leverage}
        liqBufferPct={liqBufferPctAtLeverage}
        onCancel={() => setRiskModalOpen(false)}
        onConfirm={() => {
          setRiskModalOpen(false)
          void executeSubmit()
        }}
      />
    </div>
  )
}

// ─── Helper components ───

function FieldGroup({ label, right, children }: {
  label: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <label className="text-[10px] text-text-muted uppercase tracking-wider font-medium shrink-0">{label}</label>
        {right && <div className="min-w-0 truncate">{right}</div>}
      </div>
      {children}
    </div>
  )
}

function SummaryRow({ label, value, muted, bold, className, tooltip }: {
  label: string
  value: string
  muted?: boolean
  bold?: boolean
  className?: string
  tooltip?: { title: string; content: string }
}) {
  const labelEl = (
    <span className={cn(
      'text-text-muted text-[10px] uppercase tracking-wider',
      tooltip && 'cursor-help',
      className,
    )}>
      {label}
    </span>
  )
  return (
    <div className="flex justify-between items-center gap-2">
      {tooltip ? (
        <Tooltip title={tooltip.title} content={tooltip.content}>{labelEl}</Tooltip>
      ) : (
        labelEl
      )}
      <span className={cn(
        'font-mono tabular-nums truncate',
        bold ? 'text-text-primary font-semibold' : muted ? 'text-text-muted' : 'text-text-secondary',
        className
      )}>{value}</span>
    </div>
  )
}

/**
 * Compact dropdown that shows the keyboard shortcut cheat sheet.
 * Discoverable affordance — without it, users wouldn't know the hotkeys
 * we wired up via useOrderFormShortcuts exist.
 */
function KeyboardShortcutsButton() {
  return (
    <Dropdown
      trigger={<Keyboard className="w-3.5 h-3.5" />}
      align="right"
      width="min-w-[220px]"
    >
      <div className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
          Keyboard shortcuts
        </div>
        <div className="space-y-1.5 text-[11px]">
          <ShortcutRow keys={['B']} label="Long" />
          <ShortcutRow keys={['S']} label="Short" />
          <ShortcutRow keys={['M']} label="Market" />
          <ShortcutRow keys={['L']} label="Limit" />
          <div className="border-t border-border my-1" />
          <ShortcutRow keys={['1']} label="1× leverage" />
          <ShortcutRow keys={['2']} label="2× leverage" />
          <ShortcutRow keys={['3']} label="5× leverage" />
          <ShortcutRow keys={['4']} label="10× leverage" />
          <ShortcutRow keys={['5']} label="20× leverage" />
          <div className="border-t border-border my-1" />
          <ShortcutRow keys={['Esc']} label="Clear form" />
        </div>
        <div className="text-[9px] text-text-muted mt-2.5 leading-relaxed">
          Shortcuts are paused while typing in an input.
        </div>
      </div>
    </Dropdown>
  )
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-secondary">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map(k => (
          <kbd
            key={k}
            className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1 text-[10px] font-mono text-text-primary bg-surface border border-border rounded"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  )
}

function TradeStatusDisplay({ status, error }: { status: TradeStatus; error: string | null }) {
  const steps: { key: TradeStatus; label: string }[] = [
    { key: 'approving', label: 'Approve USDC' },
    { key: 'simulating', label: 'Pre-flight Check' },
    { key: 'submitting', label: 'Submit Transaction' },
    { key: 'confirming', label: 'Confirming On-chain' },
  ]

  const statusOrder: TradeStatus[] = ['approving', 'simulating', 'submitting', 'confirming', 'success']
  const currentIdx = statusOrder.indexOf(status)

  return (
    <div className="border-t border-border pt-3 space-y-1.5">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Transaction Progress</div>
      {steps.map((step) => {
        const stepIdx = statusOrder.indexOf(step.key)
        const isDone = currentIdx > stepIdx
        const isCurrent = currentIdx === stepIdx

        return (
          <div key={step.key} className="flex items-center gap-2 text-xs">
            {isDone ? (
              <Check className="w-3.5 h-3.5 text-long shrink-0" />
            ) : isCurrent ? (
              status === 'error'
                ? <X className="w-3.5 h-3.5 text-short shrink-0" />
                : <Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-border-light shrink-0" />
            )}
            <span className={cn(
              isDone ? 'text-text-secondary' :
              isCurrent ? (status === 'error' ? 'text-short' : 'text-text-primary') :
              'text-text-muted'
            )}>
              {step.label}
            </span>
          </div>
        )
      })}
      {error && (
        <div className="text-xs text-short bg-short-dim px-2 py-1.5 rounded mt-2 break-words">{error}</div>
      )}
    </div>
  )
}
