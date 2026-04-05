import { useTradingStore } from '../store/tradingStore'
import { cn, formatUsd } from '../lib/format'
import { Minus, Plus } from 'lucide-react'
import { useRenderCount } from '../lib/useRenderCount'

export function OrderForm() {
  useRenderCount('OrderForm')
  const {
    orderSide, orderType, leverage, orderPrice, orderSize,
    setOrderSide, setOrderType, setLeverage, setOrderPrice, setOrderSize,
    selectedMarket, accountBalance, walletConnected, connectWallet,
  } = useTradingStore()

  const sizeNum = parseFloat(orderSize) || 0
  const priceNum = parseFloat(orderPrice) || selectedMarket.lastPrice
  const notional = sizeNum * priceNum
  const margin = notional / leverage
  const fee = notional * 0.0005

  const leveragePresets = [1, 2, 5, 10, 20, 50]

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
          {/* Quick size buttons */}
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

        {/* Order Summary */}
        {sizeNum > 0 && (
          <div className="space-y-1.5 text-xs border-t border-border pt-3">
            <div className="flex justify-between">
              <span className="text-text-muted">Notional</span>
              <span className="font-mono text-text-secondary">${formatUsd(notional)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Margin Required</span>
              <span className="font-mono text-text-secondary">${formatUsd(margin)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Fee (0.05%)</span>
              <span className="font-mono text-text-secondary">${formatUsd(fee)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="p-3 border-t border-border">
        {walletConnected ? (
          <button
            className={cn(
              'w-full py-3 rounded-lg font-medium text-sm text-white transition-colors cursor-pointer',
              orderSide === 'long'
                ? 'bg-long hover:bg-long/80'
                : 'bg-short hover:bg-short/80'
            )}
          >
            {orderSide === 'long' ? 'Long' : 'Short'} {selectedMarket.baseAsset}
          </button>
        ) : (
          <button
            onClick={connectWallet}
            className="w-full py-3 rounded-lg font-medium text-sm text-white bg-accent hover:bg-accent/80 transition-colors cursor-pointer"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </div>
  )
}
