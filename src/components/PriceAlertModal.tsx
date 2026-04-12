/**
 * PriceAlertModal — create and manage price target alerts.
 */

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { Target, Trash2, TrendingUp, TrendingDown, Plus } from 'lucide-react'
import { usePriceAlertStore, type PriceAlert } from '../store/priceAlertStore'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from '../hooks/usePrices'
import { Modal } from './ui/Modal'
import { cn, formatUsd } from '../lib/format'

interface PriceAlertModalProps {
  open: boolean
  onClose: () => void
}

export function PriceAlertModal({ open, onClose }: PriceAlertModalProps) {
  const { address } = useAccount()
  const { alerts, loadForAddress, addAlert, removeAlert, clearAll } = usePriceAlertStore()
  const { markets } = useTradingStore()
  const { getPrice } = usePrices()

  const [selectedMarket, setSelectedMarket] = useState(markets[0]?.symbol ?? '')
  const [condition, setCondition] = useState<'above' | 'below'>('above')
  const [targetPrice, setTargetPrice] = useState('')

  useEffect(() => {
    if (address && open) loadForAddress(address)
  }, [address, open, loadForAddress])

  const handleAdd = () => {
    const price = parseFloat(targetPrice)
    if (!price || price <= 0) return
    const market = markets.find(m => m.symbol === selectedMarket)
    if (!market) return

    addAlert({
      market: selectedMarket,
      symbol: market.baseAsset,
      condition,
      targetPrice: price,
    })
    setTargetPrice('')
  }

  const activeAlerts = alerts.filter(a => !a.triggered)
  const triggeredAlerts = alerts.filter(a => a.triggered)

  return (
    <Modal open={open} onClose={onClose} title="Price Alerts" maxWidth="max-w-md">
      {/* Add alert form */}
      <div className="bg-surface/50 rounded-lg p-3 mb-4 space-y-2.5">
        <div className="text-[10px] text-text-muted uppercase tracking-wider font-medium">New Alert</div>

        {/* Market selector */}
        <div className="flex gap-1.5">
          {markets.map(m => (
            <button
              key={m.symbol}
              onClick={() => setSelectedMarket(m.symbol)}
              className={cn(
                'flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer',
                selectedMarket === m.symbol
                  ? 'bg-accent-dim text-accent'
                  : 'bg-surface text-text-muted hover:text-text-primary',
              )}
            >
              {m.baseAsset}
            </button>
          ))}
        </div>

        {/* Condition + price */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setCondition('above')}
            className={cn(
              'flex items-center gap-1 px-3 py-2 text-xs rounded transition-colors cursor-pointer',
              condition === 'above'
                ? 'bg-long-dim text-long'
                : 'bg-surface text-text-muted hover:text-text-primary',
            )}
          >
            <TrendingUp className="w-3 h-3" />
            Above
          </button>
          <button
            onClick={() => setCondition('below')}
            className={cn(
              'flex items-center gap-1 px-3 py-2 text-xs rounded transition-colors cursor-pointer',
              condition === 'below'
                ? 'bg-short-dim text-short'
                : 'bg-surface text-text-muted hover:text-text-primary',
            )}
          >
            <TrendingDown className="w-3 h-3" />
            Below
          </button>
          <input
            type="number"
            value={targetPrice}
            onChange={e => setTargetPrice(e.target.value)}
            placeholder="Price"
            className="flex-1 min-w-0 bg-surface border border-border rounded px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-accent/40"
          />
        </div>

        <button
          onClick={handleAdd}
          disabled={!targetPrice || parseFloat(targetPrice) <= 0}
          className="w-full flex items-center justify-center gap-1.5 py-2 bg-accent text-white text-xs font-semibold rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent/90"
        >
          <Plus className="w-3 h-3" />
          Add Alert
        </button>
      </div>

      {/* Active alerts */}
      {activeAlerts.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1.5">
            Active ({activeAlerts.length})
          </div>
          <div className="space-y-1">
            {activeAlerts.map(alert => (
              <AlertRow key={alert.id} alert={alert} onRemove={removeAlert} getPrice={getPrice} />
            ))}
          </div>
        </div>
      )}

      {/* Triggered alerts */}
      {triggeredAlerts.length > 0 && (
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1.5">
            Triggered ({triggeredAlerts.length})
          </div>
          <div className="space-y-1 opacity-60">
            {triggeredAlerts.map(alert => (
              <AlertRow key={alert.id} alert={alert} onRemove={removeAlert} getPrice={getPrice} />
            ))}
          </div>
        </div>
      )}

      {alerts.length === 0 && (
        <div className="flex flex-col items-center py-4 gap-2 text-text-muted">
          <Target className="w-5 h-5" />
          <span className="text-[10px]">No alerts set. Add one above.</span>
        </div>
      )}
    </Modal>
  )
}

function AlertRow({
  alert,
  onRemove,
  getPrice,
}: {
  alert: PriceAlert
  onRemove: (id: string) => void
  getPrice: (market: string) => { price: number } | undefined
}) {
  const currentPrice = getPrice(alert.market)?.price

  return (
    <div className="flex items-center justify-between bg-surface/50 rounded px-3 py-2 group">
      <div className="flex items-center gap-2">
        <span className={cn(
          'text-[10px] font-medium',
          alert.condition === 'above' ? 'text-long' : 'text-short',
        )}>
          {alert.condition === 'above' ? '↑' : '↓'}
        </span>
        <span className="text-xs font-medium text-text-primary">{alert.symbol}</span>
        <span className="text-[10px] text-text-muted">{alert.condition}</span>
        <span className="text-xs font-mono text-text-primary">${formatUsd(alert.targetPrice)}</span>
      </div>
      <div className="flex items-center gap-2">
        {currentPrice && (
          <span className="text-[10px] font-mono text-text-muted">
            now: ${formatUsd(currentPrice)}
          </span>
        )}
        <button
          onClick={() => onRemove(alert.id)}
          className="text-text-muted hover:text-short transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
