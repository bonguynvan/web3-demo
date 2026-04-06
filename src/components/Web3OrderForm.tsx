/**
 * Web3OrderForm — order entry with real on-chain execution via Router contract.
 *
 * Flow: Connect wallet → Enter size/leverage → Submit → Approve USDC → Confirm tx
 * No EIP-712 signing — this is an AMM model (trade directly against liquidity pool).
 */

import { useCallback } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Minus, Plus, Loader2, Check, X } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { useUsdcBalance } from '../hooks/useTokenBalance'
import { usePrices } from '../hooks/usePrices'
import { useTradeExecution, type TradeStatus } from '../hooks/useTradeExecution'
import { getContracts, getMarkets } from '../lib/contracts'
import { cn } from '../lib/format'

export function Web3OrderForm() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()

  const {
    orderSide, orderType, leverage, orderPrice, orderSize,
    setOrderSide, setOrderType, setLeverage, setOrderPrice, setOrderSize,
    selectedMarket,
  } = useTradingStore()

  const { dollars: usdcBalance } = useUsdcBalance()
  const { getPrice } = usePrices()
  const { status, error, increasePosition } = useTradeExecution()

  const currentPrice = getPrice(selectedMarket.symbol)
  const markPrice = currentPrice?.price ?? 0

  // Get index token address for the selected market
  let indexToken: `0x${string}` | undefined
  try {
    const contracts = getContracts(chainId)
    const markets = getMarkets(contracts.addresses)
    indexToken = markets.find(m => m.symbol === selectedMarket.symbol)?.indexToken
  } catch {
    // Chain not configured
  }

  const sizeNum = parseFloat(orderSize) || 0
  const priceNum = orderType === 'market' ? markPrice : (parseFloat(orderPrice) || markPrice)
  const notional = sizeNum * priceNum
  const margin = leverage > 0 ? notional / leverage : 0
  const feeRate = 0.001 // 0.1% (10 bps)
  const fee = notional * feeRate

  const leveragePresets = [1, 2, 5, 10, 20]

  const handleSubmitOrder = useCallback(async () => {
    if (!indexToken || !currentPrice || sizeNum === 0) return

    // For market orders: collateral = notional / leverage, size = notional
    const collateralUsd = margin
    const sizeUsd = notional

    await increasePosition({
      indexToken,
      collateralUsd,
      sizeUsd,
      isLong: orderSide === 'long',
      currentPriceRaw: currentPrice.raw,
    })

    if (status === 'success') {
      setOrderSize('')
    }
  }, [indexToken, currentPrice, sizeNum, margin, notional, orderSide, increasePosition, status, setOrderSize])

  const formatUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const isSubmitting = status !== 'idle' && status !== 'success' && status !== 'error'

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

        {/* Size Input — in USD collateral */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">
            Collateral (USDC)
          </label>
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
          {/* Quick-fill percentage buttons */}
          <div className="flex gap-1 mt-1.5">
            {[10, 25, 50, 75, 100].map(pct => (
              <button
                key={pct}
                onClick={() => {
                  const maxCollateral = usdcBalance
                  setOrderSize(((maxCollateral * pct) / 100).toFixed(2))
                }}
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

        {/* Order Summary */}
        {sizeNum > 0 && markPrice > 0 && (
          <div className="space-y-1.5 text-xs border-t border-border pt-3">
            <div className="flex justify-between">
              <span className="text-text-muted">Position Size</span>
              <span className="font-mono text-text-secondary">${formatUsd(notional)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Collateral</span>
              <span className="font-mono text-text-secondary">${formatUsd(margin)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Fee (0.1%)</span>
              <span className="font-mono text-text-secondary">${formatUsd(fee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Oracle Price</span>
              <span className="font-mono text-text-secondary">${formatUsd(markPrice)}</span>
            </div>
          </div>
        )}

        {/* Trade Status */}
        {status !== 'idle' && (
          <TradeStatusDisplay status={status} error={error} />
        )}
      </div>

      {/* Submit Button */}
      <div className="p-3 border-t border-border">
        {!isConnected ? (
          <button
            disabled
            className="w-full py-3 rounded-lg font-medium text-sm text-text-muted bg-surface cursor-not-allowed"
          >
            Connect Wallet First
          </button>
        ) : (
          <button
            onClick={handleSubmitOrder}
            disabled={sizeNum === 0 || isSubmitting || markPrice === 0}
            className={cn(
              'w-full py-3 rounded-lg font-medium text-sm text-white transition-colors cursor-pointer disabled:opacity-50',
              orderSide === 'long'
                ? 'bg-long hover:bg-long/80'
                : 'bg-short hover:bg-short/80'
            )}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {status === 'approving' ? 'Approving USDC...' :
                 status === 'submitting' ? 'Submitting...' :
                 status === 'confirming' ? 'Confirming...' :
                 'Processing...'}
              </span>
            ) : (
              `${orderSide === 'long' ? 'Long' : 'Short'} ${selectedMarket.baseAsset}`
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function TradeStatusDisplay({ status, error }: { status: TradeStatus; error: string | null }) {
  const steps: { key: TradeStatus; label: string }[] = [
    { key: 'approving', label: 'Approve USDC' },
    { key: 'submitting', label: 'Submit Transaction' },
    { key: 'confirming', label: 'Confirming On-chain' },
    { key: 'success', label: 'Position Opened' },
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

      {status === 'success' && (
        <div className="flex items-center gap-1 text-xs text-long mt-2">
          <Check className="w-3.5 h-3.5" />
          Trade confirmed!
        </div>
      )}
    </div>
  )
}
