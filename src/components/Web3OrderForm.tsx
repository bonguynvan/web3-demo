/**
 * Web3OrderForm — order entry with real EIP-712 signing flow.
 *
 * This replaces the mock OrderForm with the actual Web3 order lifecycle:
 *   1. Validate inputs
 *   2. Sign order with EIP-712 (MetaMask popup)
 *   3. Submit to matching engine
 *   4. Show real-time order status progress
 *
 * The order status flows through: building → signing → submitting → pending → matched → settled
 */

import { useState, useCallback } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { Minus, Plus, Loader2, Check, X, ExternalLink } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { useSessionStore } from '../store/sessionStore'
import { useRenderCount } from '../lib/useRenderCount'
import { cn } from '../lib/format'
import { FP } from '../lib/fixedPoint'
import { signAuthentication } from '../lib/eip712'
import { submitOrder, useOrderFlowStore, type OrderStatus } from '../lib/orderFlow'

export function Web3OrderForm() {
  useRenderCount('Web3OrderForm')

  // Wallet state (from wagmi)
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()

  // Session state (Sign-to-Trade)
  const { session, status: sessionStatus, setSession, setStatus: setSessionStatus } = useSessionStore()

  // Trading state
  const {
    orderSide, orderType, leverage, orderPrice, orderSize,
    setOrderSide, setOrderType, setLeverage, setOrderPrice, setOrderSize,
    selectedMarket, accountBalance,
  } = useTradingStore()

  // Order submission state
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)
  const updateOrder = useOrderFlowStore(s => s.updateOrder)

  const sizeNum = parseFloat(orderSize) || 0
  const priceNum = parseFloat(orderPrice) || selectedMarket.lastPrice

  // Use BigInt for accurate calculations
  const sizeBig = FP.fromString(orderSize || '0')
  const priceBig = FP.fromString(orderPrice || '0')
  const leverageBig = FP.fromNumber(leverage)
  const notional = FP.mul(sizeBig, priceBig)
  const margin = leverageBig > 0n ? FP.div(notional, leverageBig) : 0n
  const feeBig = FP.fee(sizeBig, priceBig, 5) // 5 bps taker fee

  const leveragePresets = [1, 2, 5, 10, 20, 50]

  // ── Enable Trading (Sign-to-Trade) ──
  const handleEnableTrading = useCallback(async () => {
    if (!walletClient || !address) return
    setSessionStatus('signing')
    try {
      const authSession = await signAuthentication(walletClient, address)
      setSession(authSession)
    } catch {
      setSessionStatus('error', 'Failed to sign authentication')
    }
  }, [walletClient, address, setSession, setSessionStatus])

  // ── Submit Order ──
  const handleSubmitOrder = useCallback(async () => {
    if (!walletClient || !address || !session) return
    if (sizeBig === 0n) return

    setOrderStatus('building')
    setOrderError(null)

    await submitOrder(
      {
        walletClient,
        account: address,
        session,
        market: selectedMarket.symbol,
        side: orderSide,
        size: sizeBig,
        price: orderType === 'market' ? FP.fromNumber(selectedMarket.lastPrice) : priceBig,
        leverage: leverageBig,
        orderType,
      },
      (update) => {
        setOrderStatus(update.status)
        if (update.error) setOrderError(update.error)
        updateOrder(update)

        // Clear status after success
        if (update.status === 'settled') {
          setTimeout(() => {
            setOrderStatus(null)
            setOrderSize('')
          }, 3000)
        }
        if (update.status === 'failed' || update.status === 'rejected') {
          setTimeout(() => setOrderStatus(null), 5000)
        }
      },
    )
  }, [walletClient, address, session, sizeBig, priceBig, leverageBig, selectedMarket, orderSide, orderType, updateOrder, setOrderSize])

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
          {(['limit', 'market'] as const).map(type => (
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

        {/* Price Input */}
        {orderType === 'limit' && (
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">Price (USD)</label>
            <div className="flex items-center bg-surface border border-border rounded">
              <button
                onClick={() => setOrderPrice((priceNum - 0.01).toFixed(2))}
                className="p-2 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                value={orderPrice}
                onChange={e => setOrderPrice(e.target.value)}
                className="flex-1 bg-transparent text-center font-mono text-sm text-text-primary outline-none py-2"
              />
              <button
                onClick={() => setOrderPrice((priceNum + 0.01).toFixed(2))}
                className="p-2 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Size Input */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">
            Size ({selectedMarket.baseAsset})
          </label>
          <div className="flex items-center bg-surface border border-border rounded">
            <input
              type="number"
              value={orderSize}
              onChange={e => setOrderSize(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent font-mono text-sm text-text-primary outline-none px-3 py-2"
            />
            <span className="text-xs text-text-muted pr-3">{selectedMarket.baseAsset}</span>
          </div>
          <div className="flex gap-1 mt-1.5">
            {[10, 25, 50, 75, 100].map(pct => (
              <button
                key={pct}
                onClick={() => {
                  const maxSize = (accountBalance * leverage) / priceNum
                  setOrderSize((maxSize * pct / 100).toFixed(3))
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
            max={100}
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

        {/* Order Summary (BigInt precision) */}
        {sizeNum > 0 && (
          <div className="space-y-1.5 text-xs border-t border-border pt-3">
            <div className="flex justify-between">
              <span className="text-text-muted">Notional</span>
              <span className="font-mono text-text-secondary">${FP.toDisplay(notional)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Margin Required</span>
              <span className="font-mono text-text-secondary">${FP.toDisplay(margin)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Fee (0.05%)</span>
              <span className="font-mono text-text-secondary">${FP.toDisplay(feeBig)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Liq. Price (est.)</span>
              <span className="font-mono text-text-secondary">
                ${FP.toDisplay(FP.liquidationPrice(orderSide, priceBig > 0n ? priceBig : FP.fromNumber(selectedMarket.lastPrice), leverageBig))}
              </span>
            </div>
          </div>
        )}

        {/* Order Status Progress */}
        {orderStatus && (
          <OrderStatusDisplay status={orderStatus} error={orderError} />
        )}
      </div>

      {/* Submit Button — three states: not connected, connected but not authed, ready */}
      <div className="p-3 border-t border-border">
        {!isConnected ? (
          // State 1: Wallet not connected — wagmi's useConnect handles this
          <button
            disabled
            className="w-full py-3 rounded-lg font-medium text-sm text-text-muted bg-surface cursor-not-allowed"
          >
            Connect Wallet First
          </button>
        ) : sessionStatus !== 'ready' ? (
          // State 2: Wallet connected, but no Sign-to-Trade session
          <button
            onClick={handleEnableTrading}
            disabled={sessionStatus === 'signing'}
            className="w-full py-3 rounded-lg font-medium text-sm text-white bg-accent hover:bg-accent/80 transition-colors cursor-pointer disabled:opacity-50"
          >
            {sessionStatus === 'signing' ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Check MetaMask...
              </span>
            ) : (
              'Enable Trading (Sign-to-Trade)'
            )}
          </button>
        ) : (
          // State 3: Ready to trade
          <button
            onClick={handleSubmitOrder}
            disabled={sizeNum === 0 || orderStatus !== null}
            className={cn(
              'w-full py-3 rounded-lg font-medium text-sm text-white transition-colors cursor-pointer disabled:opacity-50',
              orderSide === 'long'
                ? 'bg-long hover:bg-long/80'
                : 'bg-short hover:bg-short/80'
            )}
          >
            {orderStatus ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {orderStatus === 'signing' ? 'Sign in MetaMask...' :
                 orderStatus === 'submitting' ? 'Submitting...' :
                 orderStatus === 'pending' ? 'Matching...' :
                 orderStatus === 'matched' ? 'Matched! Settling...' :
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

/**
 * Shows the order lifecycle steps with visual indicators.
 */
function OrderStatusDisplay({ status, error }: { status: OrderStatus; error: string | null }) {
  const steps: { key: OrderStatus; label: string }[] = [
    { key: 'signing', label: 'Sign Order (EIP-712)' },
    { key: 'submitting', label: 'Submit to Matching Engine' },
    { key: 'pending', label: 'Waiting for Match' },
    { key: 'matched', label: 'Matched (Off-chain)' },
    { key: 'settling', label: 'Settling On-chain' },
    { key: 'settled', label: 'Confirmed On-chain' },
  ]

  const statusOrder = ['building', 'signing', 'submitting', 'pending', 'matched', 'settling', 'settled']
  const currentIdx = statusOrder.indexOf(status)
  const isFailed = status === 'failed' || status === 'rejected'

  return (
    <div className="border-t border-border pt-3 space-y-1.5">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Order Progress</div>
      {steps.map((step) => {
        const stepIdx = statusOrder.indexOf(step.key)
        const isDone = currentIdx > stepIdx
        const isCurrent = currentIdx === stepIdx

        return (
          <div key={step.key} className="flex items-center gap-2 text-xs">
            {isDone ? (
              <Check className="w-3.5 h-3.5 text-long shrink-0" />
            ) : isCurrent ? (
              isFailed ? (
                <X className="w-3.5 h-3.5 text-short shrink-0" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />
              )
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-border-light shrink-0" />
            )}
            <span className={cn(
              isDone ? 'text-text-secondary' :
              isCurrent ? (isFailed ? 'text-short' : 'text-text-primary') :
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

      {status === 'settled' && (
        <div className="flex items-center gap-1 text-xs text-long mt-2">
          <Check className="w-3.5 h-3.5" />
          Order complete!
          <ExternalLink className="w-3 h-3 ml-1" />
        </div>
      )}
    </div>
  )
}
