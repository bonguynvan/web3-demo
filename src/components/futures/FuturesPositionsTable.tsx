/**
 * FuturesPositionsTable — active futures positions with expiry countdown
 * and settlement history.
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Inbox, Clock } from 'lucide-react'
import { useFuturesPositions } from '../../hooks/useFuturesPositions'
import { closeFuturesPosition } from '../../lib/futuresData'
import { usePrices } from '../../hooks/usePrices'
import { cn, formatUsd } from '../../lib/format'
import { useToast } from '../../store/toastStore'
import type { FuturesPosition, FuturesSettlementRecord } from '../../types/futures'

type FuturesTab = 'active' | 'settled'

export function FuturesPositionsTable() {
  const { t } = useTranslation('futures')
  const { positions, history, totalCount } = useFuturesPositions()
  const [tab, setTab] = useState<FuturesTab>('active')

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex items-center border-b border-border px-1 shrink-0">
        <button
          onClick={() => setTab('active')}
          className={cn(
            'px-3 py-2 text-[10px] font-medium transition-colors cursor-pointer border-b-2',
            tab === 'active'
              ? 'text-text-primary border-accent'
              : 'text-text-muted border-transparent hover:text-text-secondary',
          )}
        >
          {t('active')}
          {totalCount > 0 && (
            <span className="ml-1 bg-accent-dim text-accent text-[9px] px-1 py-0.5 rounded-full">{totalCount}</span>
          )}
        </button>
        <button
          onClick={() => setTab('settled')}
          className={cn(
            'px-3 py-2 text-[10px] font-medium transition-colors cursor-pointer border-b-2',
            tab === 'settled'
              ? 'text-text-primary border-accent'
              : 'text-text-muted border-transparent hover:text-text-secondary',
          )}
        >
          {t('settlement_history')}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'active' ? (
          <ActivePositions positions={positions} />
        ) : (
          <SettledHistory history={history} />
        )}
      </div>
    </div>
  )
}

function ActivePositions({ positions }: { positions: FuturesPosition[] }) {
  const { t } = useTranslation('futures')
  const { getPrice } = usePrices()
  const toast = useToast()

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2">
        <div className="w-12 h-12 rounded-full bg-surface/70 flex items-center justify-center text-text-muted">
          <Clock className="w-5 h-5" />
        </div>
        <div className="text-xs text-text-secondary font-medium">{t('no_futures_positions')}</div>
        <div className="text-[10px] text-text-muted">{t('open_futures_hint')}</div>
      </div>
    )
  }

  const handleClose = (pos: FuturesPosition) => {
    const priceData = getPrice(pos.market)
    if (!priceData?.price) return
    const result = closeFuturesPosition(pos.id, priceData.price)
    if (result) {
      toast.success(
        `${pos.market} ${pos.tenor} closed early`,
        `P&L: ${result.pnl >= 0 ? '+' : ''}$${formatUsd(Math.abs(result.pnl))}`,
      )
    }
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
          <th className="text-left px-3 py-2 font-medium">Market</th>
          <th className="text-left px-3 py-2 font-medium">Side</th>
          <th className="text-right px-3 py-2 font-medium">Size</th>
          <th className="text-right px-3 py-2 font-medium">Entry</th>
          <th className="text-center px-3 py-2 font-medium">Tenor</th>
          <th className="text-right px-3 py-2 font-medium">{t('expires_in')}</th>
          <th className="text-right px-3 py-2 font-medium">PnL</th>
          <th className="text-center px-3 py-2 font-medium" />
        </tr>
      </thead>
      <tbody>
        {positions.map(pos => (
          <tr key={pos.id} className="border-b border-border/50 hover:bg-panel-light transition-colors">
            <td className="px-3 py-2.5 font-medium text-text-primary">{pos.market}</td>
            <td className="px-3 py-2.5">
              <span className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
                pos.side === 'long' ? 'bg-long-dim text-long' : 'bg-short-dim text-short',
              )}>
                {pos.side} {pos.leverage}x
              </span>
            </td>
            <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(pos.size)}</td>
            <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(pos.entryPrice)}</td>
            <td className="px-3 py-2.5 text-center">
              <span className="px-2 py-0.5 bg-accent-dim text-accent text-[10px] rounded font-medium">{pos.tenor}</span>
            </td>
            <td className="px-3 py-2.5 text-right">
              <ExpiryCountdown expiryTimestamp={pos.expiryTimestamp} />
            </td>
            <td className="px-3 py-2.5 text-right">
              <span className={cn('font-mono font-medium', pos.pnl >= 0 ? 'text-long' : 'text-short')}>
                {pos.pnl >= 0 ? '+' : ''}${formatUsd(Math.abs(pos.pnl))}
              </span>
            </td>
            <td className="px-3 py-2.5 text-center">
              <button
                onClick={() => handleClose(pos)}
                className="text-[10px] border px-2 py-1 rounded transition-colors cursor-pointer text-short border-short/30 hover:border-short/60 hover:bg-short-dim"
              >
                Close
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SettledHistory({ history }: { history: FuturesSettlementRecord[] }) {
  const { t } = useTranslation('futures')

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8 gap-2">
        <div className="w-12 h-12 rounded-full bg-surface/70 flex items-center justify-center text-text-muted">
          <Inbox className="w-5 h-5" />
        </div>
        <div className="text-xs text-text-secondary font-medium">{t('no_futures_positions')}</div>
      </div>
    )
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
          <th className="text-left px-3 py-2 font-medium">Market</th>
          <th className="text-left px-3 py-2 font-medium">Side</th>
          <th className="text-center px-3 py-2 font-medium">Tenor</th>
          <th className="text-right px-3 py-2 font-medium">Entry</th>
          <th className="text-right px-3 py-2 font-medium">{t('settlement_price')}</th>
          <th className="text-right px-3 py-2 font-medium">PnL</th>
          <th className="text-right px-3 py-2 font-medium">{t('settled')}</th>
        </tr>
      </thead>
      <tbody>
        {history.map(record => (
          <tr key={record.id} className="border-b border-border/50 hover:bg-panel-light transition-colors">
            <td className="px-3 py-2.5 font-medium text-text-primary">{record.market}</td>
            <td className="px-3 py-2.5">
              <span className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
                record.side === 'long' ? 'bg-long-dim text-long' : 'bg-short-dim text-short',
              )}>
                {record.side}
              </span>
            </td>
            <td className="px-3 py-2.5 text-center">
              <span className="px-2 py-0.5 bg-surface text-text-muted text-[10px] rounded">{record.tenor}</span>
            </td>
            <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(record.entryPrice)}</td>
            <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(record.settlementPrice)}</td>
            <td className="px-3 py-2.5 text-right">
              <span className={cn('font-mono font-medium', record.pnl >= 0 ? 'text-long' : 'text-short')}>
                {record.pnl >= 0 ? '+' : ''}${formatUsd(Math.abs(record.pnl))}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right text-text-muted">{formatTimeAgo(record.settledAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Live countdown to expiry. */
function ExpiryCountdown({ expiryTimestamp }: { expiryTimestamp: number }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000) // update every minute
    return () => clearInterval(interval)
  }, [])

  const remaining = expiryTimestamp - now
  if (remaining <= 0) return <span className="text-short font-mono text-[10px] animate-pulse">Expired</span>

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))

  const isUrgent = remaining < 60 * 60 * 1000 // < 1 hour

  let display: string
  if (days > 0) display = `${days}d ${hours}h`
  else if (hours > 0) display = `${hours}h ${minutes}m`
  else display = `${minutes}m`

  return (
    <span className={cn('font-mono text-[10px]', isUrgent ? 'text-short' : 'text-text-muted')}>
      {display}
    </span>
  )
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
