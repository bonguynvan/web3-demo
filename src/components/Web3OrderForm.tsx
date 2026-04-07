/**
 * Web3OrderForm — order entry with on-chain execution or demo mode.
 *
 * Works in two modes:
 * 1. Connected + Anvil running: real contract calls via Router
 * 2. Demo / no Anvil: simulates trade success with toast notification
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Minus, Plus, Loader2, Check, X } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { useUsdcBalance } from '../hooks/useTokenBalance'
import { usePrices } from '../hooks/usePrices'
import { useTradeExecution, type TradeStatus } from '../hooks/useTradeExecution'
import { getContracts, getMarkets } from '../lib/contracts'
import { cn, formatUsd } from '../lib/format'
import { useToast } from '../store/toastStore'

// Demo balance when wallet not connected or balance is 0
const DEMO_BALANCE = 100_000

export function Web3OrderForm() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const toast = useToast()

  const {
    orderSide, orderType, leverage, orderPrice, orderSize,
    setOrderSide, setOrderType, setLeverage, setOrderPrice, setOrderSize,
    selectedMarket,
  } = useTradingStore()

  const { dollars: onChainBalance } = useUsdcBalance()
  const { getPrice } = usePrices()
  const { status, error, increasePosition } = useTradeExecution()

  const currentPrice = getPrice(selectedMarket.symbol)
  const markPrice = currentPrice?.price ?? 0

  // Use on-chain balance if > 0, otherwise demo balance
  const balance = onChainBalance > 0 ? onChainBalance : DEMO_BALANCE

  // Resolve index token (may fail if chain not configured)
  let indexToken: `0x${string}` | undefined
  try {
    const contracts = getContracts(chainId)
    const markets = getMarkets(contracts.addresses)
    indexToken = markets.find(m => m.symbol === selectedMarket.symbol)?.indexToken
  } catch {
    // Not configured — demo mode
  }

  // ─── Computed values ───
  const collateralNum = parseFloat(orderSize) || 0
  const priceNum = orderType === 'market' ? markPrice : (parseFloat(orderPrice) || markPrice)
  const notional = collateralNum * leverage
  const feeRate = 0.001
  const fee = notional * feeRate
  const liqPrice = priceNum > 0 && leverage > 0
    ? orderSide === 'long'
      ? priceNum * (1 - 0.95 / leverage)
      : priceNum * (1 + 0.95 / leverage)
    : 0

  const leveragePresets = [1, 2, 5, 10, 20]

  // ─── TP/SL ───
  const [showTpSl, setShowTpSl] = useState(false)
  const [tpPrice, setTpPrice] = useState('')
  const [slPrice, setSlPrice] = useState('')
  const [reduceOnly, setReduceOnly] = useState(false)
  const [demoSubmitting, setDemoSubmitting] = useState(false)

  const tpNum = parseFloat(tpPrice) || 0
  const slNum = parseFloat(slPrice) || 0
  const tpPnl = tpNum > 0 && priceNum > 0 && notional > 0
    ? (orderSide === 'long' ? (tpNum - priceNum) / priceNum : (priceNum - tpNum) / priceNum) * notional
    : 0
  const slPnl = slNum > 0 && priceNum > 0 && notional > 0
    ? (orderSide === 'long' ? (slNum - priceNum) / priceNum : (priceNum - slNum) / priceNum) * notional
    : 0

  // ─── Status tracking ───
  const prevStatusRef = useRef(status)
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      if (status === 'success') {
        toast.success(
          `${orderSide === 'long' ? 'Long' : 'Short'} ${selectedMarket.baseAsset} opened`,
          `$${formatUsd(notional)} at ${leverage}x`
        )
        setOrderSize('')
      } else if (status === 'error' && error) {
        toast.error('Trade failed', error)
      }
    }
    prevStatusRef.current = status
  }, [status, error, orderSide, selectedMarket.baseAsset, notional, leverage, setOrderSize, toast])

  // ─── Submit handler ───
  const handleSubmitOrder = useCallback(async () => {
    if (collateralNum <= 0 || priceNum <= 0) return

    // Try real execution if connected and contracts available
    if (isConnected && indexToken && currentPrice) {
      try {
        await increasePosition({
          indexToken,
          collateralUsd: collateralNum,
          sizeUsd: notional,
          isLong: orderSide === 'long',
          currentPriceRaw: currentPrice.raw,
        })
        return
      } catch {
        // Fall through to demo mode
      }
    }

    // Demo mode — simulate success
    setDemoSubmitting(true)
    await new Promise(r => setTimeout(r, 1200))
    toast.success(
      `${orderSide === 'long' ? 'Long' : 'Short'} ${selectedMarket.baseAsset} opened`,
      `$${formatUsd(notional)} at ${leverage}x leverage (demo)`
    )
    setOrderSize('')
    setDemoSubmitting(false)
  }, [collateralNum, priceNum, isConnected, indexToken, currentPrice, increasePosition, notional, orderSide, selectedMarket.baseAsset, leverage, setOrderSize, toast])

  const isSubmitting = demoSubmitting || (status !== 'idle' && status !== 'success' && status !== 'error')

  // ─── Validation ───
  const canSubmit = collateralNum > 0 && priceNum > 0 && !isSubmitting
  const validationMsg = collateralNum <= 0 ? 'Enter collateral amount' :
    priceNum <= 0 ? 'Waiting for price...' : null

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      {/* Side Toggle */}
      <div className="flex p-1.5 gap-1 border-b border-border">
        <button
          onClick={() => setOrderSide('long')}
          className={cn(
            'flex-1 py-2 text-sm font-medium rounded transition-colors cursor-pointer',
            orderSide === 'long' ? 'bg-long text-white' : 'text-text-muted hover:text-text-secondary'
          )}
        >
          Long
        </button>
        <button
          onClick={() => setOrderSide('short')}
          className={cn(
            'flex-1 py-2 text-sm font-medium rounded transition-colors cursor-pointer',
            orderSide === 'short' ? 'bg-short text-white' : 'text-text-muted hover:text-text-secondary'
          )}
        >
          Short
        </button>
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

        {/* Price Input (limit orders only) */}
        {orderType === 'limit' && (
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">Price (USD)</label>
            <div className="flex items-center bg-surface border border-border rounded">
              <button
                onClick={() => setOrderPrice(((parseFloat(orderPrice) || markPrice) - 1).toFixed(2))}
                className="p-2 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                value={orderPrice || (markPrice > 0 ? markPrice.toFixed(2) : '')}
                onChange={e => setOrderPrice(e.target.value)}
                placeholder={markPrice > 0 ? markPrice.toFixed(2) : '0.00'}
                className="flex-1 bg-transparent text-center font-mono text-sm text-text-primary outline-none py-2"
              />
              <button
                onClick={() => setOrderPrice(((parseFloat(orderPrice) || markPrice) + 1).toFixed(2))}
                className="p-2 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Collateral Input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-text-muted uppercase tracking-wider">Collateral (USDC)</label>
            <span className="text-[10px] text-text-muted font-mono">
              Bal: ${formatUsd(balance)}
            </span>
          </div>
          <div className="flex items-center bg-surface border border-border rounded">
            <input
              type="number"
              value={orderSize}
              onChange={e => setOrderSize(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent font-mono text-sm text-text-primary outline-none px-3 py-2"
            />
            <span className="text-xs text-text-muted pr-3">USDC</span>
          </div>
          <div className="flex gap-1 mt-1.5">
            {[10, 25, 50, 75, 100].map(pct => (
              <button
                key={pct}
                onClick={() => setOrderSize(((balance * pct) / 100).toFixed(2))}
                className="flex-1 text-[10px] text-text-muted hover:text-text-primary bg-surface hover:bg-panel-light py-1 rounded transition-colors cursor-pointer"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Leverage */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-text-muted uppercase tracking-wider">Leverage</label>
            <span className="text-sm font-mono text-accent font-medium">{leverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            value={leverage}
            onChange={e => setLeverage(Number(e.target.value))}
            className="w-full accent-accent h-1 cursor-pointer"
          />
          <div className="flex gap-1 mt-1.5">
            {leveragePresets.map(l => (
              <button
                key={l}
                onClick={() => setLeverage(l)}
                className={cn(
                  'flex-1 text-[10px] py-1 rounded transition-colors cursor-pointer',
                  leverage === l ? 'bg-accent-dim text-accent' : 'text-text-muted bg-surface hover:bg-panel-light'
                )}
              >
                {l}x
              </button>
            ))}
          </div>
        </div>

        {/* TP/SL Toggle + Reduce Only */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowTpSl(v => !v)}
            className={cn(
              'text-[11px] font-medium transition-colors cursor-pointer',
              showTpSl ? 'text-accent' : 'text-text-muted hover:text-text-primary'
            )}
          >
            {showTpSl ? '▾' : '▸'} TP / SL
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={reduceOnly}
              onChange={e => setReduceOnly(e.target.checked)}
              className="w-3 h-3 accent-accent cursor-pointer"
            />
            <span className="text-[10px] text-text-muted">Reduce Only</span>
          </label>
        </div>

        {/* TP/SL Inputs */}
        {showTpSl && (
          <div className="space-y-2 bg-surface/50 rounded-lg p-2.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-long uppercase tracking-wider font-medium">Take Profit</label>
                {tpPnl !== 0 && (
                  <span className={cn('text-[10px] font-mono', tpPnl >= 0 ? 'text-long' : 'text-short')}>
                    {tpPnl >= 0 ? '+' : ''}{formatUsd(tpPnl)} ({collateralNum > 0 ? ((tpPnl / collateralNum) * 100).toFixed(1) : '0'}%)
                  </span>
                )}
              </div>
              <input
                type="number"
                value={tpPrice}
                onChange={e => setTpPrice(e.target.value)}
                placeholder={orderSide === 'long' ? `e.g. ${priceNum > 0 ? formatUsd(priceNum * 1.05) : '---'}` : `e.g. ${priceNum > 0 ? formatUsd(priceNum * 0.95) : '---'}`}
                className="w-full bg-surface border border-long/20 rounded px-2.5 py-1.5 font-mono text-xs text-text-primary outline-none focus:border-long/50 transition-colors"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-short uppercase tracking-wider font-medium">Stop Loss</label>
                {slPnl !== 0 && (
                  <span className={cn('text-[10px] font-mono', slPnl >= 0 ? 'text-long' : 'text-short')}>
                    {slPnl >= 0 ? '+' : ''}{formatUsd(slPnl)} ({collateralNum > 0 ? ((slPnl / collateralNum) * 100).toFixed(1) : '0'}%)
                  </span>
                )}
              </div>
              <input
                type="number"
                value={slPrice}
                onChange={e => setSlPrice(e.target.value)}
                placeholder={orderSide === 'long' ? `e.g. ${priceNum > 0 ? formatUsd(priceNum * 0.95) : '---'}` : `e.g. ${priceNum > 0 ? formatUsd(priceNum * 1.05) : '---'}`}
                className="w-full bg-surface border border-short/20 rounded px-2.5 py-1.5 font-mono text-xs text-text-primary outline-none focus:border-short/50 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Order Summary */}
        {collateralNum > 0 && priceNum > 0 && (
          <div className="space-y-1.5 text-xs border-t border-border pt-3">
            <SummaryRow label="Position Size" value={`$${formatUsd(notional)}`} />
            <SummaryRow label="Collateral" value={`$${formatUsd(collateralNum)}`} />
            <SummaryRow label="Fee (0.1%)" value={`$${formatUsd(fee)}`} />
            <SummaryRow label="Entry Price" value={`$${formatUsd(priceNum)}`} />
            <SummaryRow label="Liq. Price" value={`$${formatUsd(liqPrice)}`} muted />
            {tpNum > 0 && (
              <SummaryRow label="Take Profit" value={`$${formatUsd(tpNum)}`} className="text-long" />
            )}
            {slNum > 0 && (
              <SummaryRow label="Stop Loss" value={`$${formatUsd(slNum)}`} className="text-short" />
            )}
          </div>
        )}

        {/* Trade Status (real execution only) */}
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
            'w-full py-3 rounded-lg font-medium text-sm text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
            orderSide === 'long'
              ? 'bg-long hover:bg-long/80'
              : 'bg-short hover:bg-short/80'
          )}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {demoSubmitting ? 'Executing...' :
               status === 'approving' ? 'Approving USDC...' :
               status === 'submitting' ? 'Submitting...' :
               status === 'confirming' ? 'Confirming...' :
               'Processing...'}
            </span>
          ) : validationMsg ? (
            <span className="text-text-muted">{validationMsg}</span>
          ) : (
            `${orderSide === 'long' ? 'Long' : 'Short'} ${selectedMarket.baseAsset}`
          )}
        </button>
        {!isConnected && (
          <div className="text-[10px] text-text-muted text-center mt-1.5">
            Connect wallet for real trades • Demo mode active
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value, muted, className }: { label: string; value: string; muted?: boolean; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className={cn('text-text-muted', className)}>{label}</span>
      <span className={cn('font-mono', muted ? 'text-text-muted' : 'text-text-secondary', className)}>{value}</span>
    </div>
  )
}

function TradeStatusDisplay({ status, error }: { status: TradeStatus; error: string | null }) {
  const steps: { key: TradeStatus; label: string }[] = [
    { key: 'approving', label: 'Approve USDC' },
    { key: 'submitting', label: 'Submit Transaction' },
    { key: 'confirming', label: 'Confirming On-chain' },
  ]

  const statusOrder: TradeStatus[] = ['approving', 'submitting', 'confirming', 'success']
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
              status === 'error' ? (
                <X className="w-3.5 h-3.5 text-short shrink-0" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />
              )
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
        <div className="text-xs text-short bg-short-dim px-2 py-1.5 rounded mt-2">{error}</div>
      )}
    </div>
  )
}
