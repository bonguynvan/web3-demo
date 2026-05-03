/**
 * PlaceOrderModal — limit-only order placement against a connected venue.
 *
 * Limit-only by design: market orders skip the price check and can fill
 * far from the displayed price during volatility. This modal builds the
 * intent, shows a notional preview, and submits via adapter.placeOrder().
 *
 * Read-only keys are caught by the adapter and surface as a toast.
 */

import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { getAdapter, getActiveAdapter } from '../adapters/registry'
import { useTradingStore } from '../store/tradingStore'
import { useVenueBalances } from '../hooks/useVenueBalances'
import { useToast } from '../store/toastStore'
import type { VenueId } from '../adapters/types'
import { cn, formatUsd } from '../lib/format'

interface Props {
  open: boolean
  onClose: () => void
  defaultMarketId?: string
  onPlaced?: () => void
}

export function PlaceOrderModal({ open, onClose, defaultMarketId, onPlaced }: Props) {
  const toast = useToast()
  const markets = useTradingStore(s => s.markets)
  const { states: venueBalances } = useVenueBalances()
  const [venueId, setVenueId] = useState<VenueId>('binance')
  const [marketId, setMarketId] = useState(defaultMarketId ?? '')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [reduceOnly, setReduceOnly] = useState(false)
  const [busy, setBusy] = useState(false)

  // Pre-fill price from the current ticker when the modal opens with a
  // default market. Avoids forcing the user to look up the price first.
  useEffect(() => {
    if (!open) return
    const target = defaultMarketId
    if (!target) return
    const t = getActiveAdapter().getTicker(target)
    if (t?.price && t.price > 0) {
      setPrice(t.price.toString())
    }
  }, [open, defaultMarketId])

  const refreshPriceFromMarket = () => {
    if (!marketId.trim()) return
    const t = getActiveAdapter().getTicker(marketId.trim())
    if (t?.price && t.price > 0) {
      setPrice(t.price.toString())
    }
  }

  const reset = () => {
    setMarketId(defaultMarketId ?? '')
    setSide('buy')
    setPrice('')
    setSize('')
    setReduceOnly(false)
    setBusy(false)
  }
  const handleClose = () => { reset(); onClose() }

  const priceNum = Number(price)
  const sizeNum = Number(size)
  const notional = priceNum > 0 && sizeNum > 0 ? priceNum * sizeNum : 0

  // Reduce-only is a perp concept. Hide the checkbox if the venue is spot-only.
  const reduceOnlySupported = (() => {
    const a = getAdapter(venueId)
    return Boolean(a?.capabilities.perp)
  })()

  // Compute USDT cash on the selected venue (if visible).
  const usdtFree = (() => {
    const v = venueBalances[venueId as keyof typeof venueBalances]
    const usdt = v?.balances?.find(b => b.asset === 'USDT')
    return usdt?.free ?? 0
  })()
  const notionalRatio = usdtFree > 0 ? notional / usdtFree : 0
  const showHighRiskWarning = side === 'buy' && notional > 0 && usdtFree > 0 && notionalRatio > 0.5

  const submit = async () => {
    if (!marketId.trim()) {
      toast.error('Missing market', 'Enter a market like BTC/USDT')
      return
    }
    if (!(priceNum > 0 && sizeNum > 0)) {
      toast.error('Invalid input', 'Price and size must be > 0')
      return
    }
    const summary = `${side.toUpperCase()} ${sizeNum} ${marketId.split('/')[0] ?? ''} @ $${priceNum} = $${formatUsd(notional)}`
    if (!confirm(`Place real limit order?\n\n${summary}\n\nThis sends a signed request to the venue.`)) return

    const adapter = getAdapter(venueId)
    if (!adapter) {
      toast.error('Adapter not found', venueId)
      return
    }

    setBusy(true)
    try {
      const order = await adapter.placeOrder({
        marketId: marketId.trim(),
        side,
        type: 'limit',
        tif: 'gtc',
        size: sizeNum,
        price: priceNum,
        reduceOnly,
      })
      toast.success('Order placed', `id ${order.id} · ${order.status}`)
      onPlaced?.()
      handleClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      toast.error('Place failed', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Place limit order">
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-amber-400/10 border border-amber-400/30 text-[11px] text-amber-400 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            Real venue order. Limit-only — market orders are intentionally
            disabled. The connected key must have trading scope.
          </div>
        </div>

        <Field label="Venue">
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value as VenueId)}
            className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary outline-none focus:border-accent capitalize"
          >
            <option value="binance">binance</option>
          </select>
        </Field>

        <Field label="Market">
          <select
            value={marketId}
            onChange={(e) => {
              const next = e.target.value
              setMarketId(next)
              const t = getActiveAdapter().getTicker(next)
              if (t?.price && t.price > 0) setPrice(t.price.toString())
            }}
            className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary outline-none focus:border-accent font-mono"
          >
            <option value="" disabled>Pick a market…</option>
            {markets.map(m => (
              <option key={m.symbol} value={m.symbol}>{m.symbol}</option>
            ))}
          </select>
        </Field>

        <Field label="Side">
          <div className="grid grid-cols-2 gap-2">
            {(['buy', 'sell'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={cn(
                  'py-2 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors cursor-pointer',
                  side === s
                    ? s === 'buy'
                      ? 'bg-long text-white'
                      : 'bg-short text-white'
                    : 'bg-surface border border-border text-text-secondary hover:text-text-primary',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (quote)">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                step="any"
                min="0"
                className="flex-1 text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary outline-none focus:border-accent font-mono"
              />
              <button
                type="button"
                onClick={refreshPriceFromMarket}
                title="Use current mark price"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md bg-surface border border-border text-text-muted hover:text-text-primary cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </Field>
          <Field label="Size (base)">
            <input
              type="number"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              step="any"
              min="0"
              className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary outline-none focus:border-accent font-mono"
            />
          </Field>
        </div>

        {/* Quick-size from free USDT */}
        {usdtFree > 0 && priceNum > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-text-muted shrink-0">% of cash</span>
            <div className="flex gap-1.5 flex-1">
              {[25, 50, 75, 100].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    const targetUsd = (usdtFree * pct) / 100
                    const computedSize = targetUsd / priceNum
                    setSize(computedSize.toFixed(8))
                  }}
                  className="flex-1 py-1.5 text-[11px] font-semibold rounded bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light cursor-pointer"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        )}

        {notional > 0 && (
          <div className="text-xs text-text-secondary bg-surface/60 rounded-md px-3 py-2 flex items-center justify-between gap-3">
            <span>Notional: <span className="font-mono text-text-primary">${formatUsd(notional)}</span></span>
            {usdtFree > 0 && (
              <span className="text-text-muted">
                {Math.round(notionalRatio * 100)}% of ${formatUsd(usdtFree)} USDT
              </span>
            )}
          </div>
        )}

        {showHighRiskWarning && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-short/15 border border-short/40 text-[11px] text-short leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              This order would consume {Math.round(notionalRatio * 100)}% of your free USDT balance.
              Confirm twice — large positions are riskier when limit orders sit unfilled.
            </div>
          </div>
        )}

        {reduceOnlySupported && (
          <label className="flex items-center gap-2 cursor-pointer text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={reduceOnly}
              onChange={(e) => setReduceOnly(e.target.checked)}
              className="w-4 h-4 accent-accent cursor-pointer"
            />
            <span>
              Reduce-only (close existing position; will not open a new one)
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleClose}
            disabled={busy}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className={cn(
              'px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer',
              side === 'buy' ? 'bg-long hover:bg-long/90' : 'bg-short hover:bg-short/90',
              'text-white',
              busy && 'opacity-60 cursor-wait',
            )}
          >
            {busy ? 'Placing…' : `${side === 'buy' ? 'Buy' : 'Sell'} (limit)`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</div>
      {children}
    </label>
  )
}
