import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { Loader2, Wallet, LineChart, Inbox, History as HistoryIcon, AlertTriangle } from 'lucide-react'
import { usePositions, type OnChainPosition } from '../hooks/usePositions'
import { usePrices } from '../hooks/usePrices'
import { useTradeExecution } from '../hooks/useTradeExecution'
import { useTradeHistory, type TradeHistoryEntry } from '../hooks/useTradeHistory'
import { cn, formatUsd } from '../lib/format'
import { useIsDemo } from '../store/modeStore'
import { closeDemoPosition, getDemoOrders, cancelDemoOrder, getDemoHistory, FEES, type DemoOrder, type DemoTradeHistory } from '../lib/demoData'
import { useToast } from '../store/toastStore'
import { Modal } from './ui/Modal'

/**
 * Reusable empty state used across positions / orders / history tabs.
 * Icon + title + subtext in a centered layout — consistent visual weight
 * so switching tabs with no data doesn't feel jarring.
 */
function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2">
      <div className="w-12 h-12 rounded-full bg-surface/70 flex items-center justify-center text-text-muted">
        {icon}
      </div>
      <div className="text-xs text-text-secondary font-medium">{title}</div>
      <div className="text-[10px] text-text-muted leading-relaxed max-w-[280px]">
        {subtitle}
      </div>
    </div>
  )
}

type Tab = 'positions' | 'orders' | 'history'

export function PositionsTable() {
  const { t } = useTranslation('perp')
  const { isConnected } = useAccount()
  const { positions } = usePositions()
  const isDemo = useIsDemo()
  const [activeTab, setActiveTab] = useState<Tab>('positions')

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center border-b border-border px-1">
        {(['positions', 'orders', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-xs font-medium capitalize transition-colors cursor-pointer border-b-2',
              activeTab === tab
                ? 'text-text-primary border-accent'
                : 'text-text-muted border-transparent hover:text-text-secondary'
            )}
          >
            {tab}
            {tab === 'positions' && positions.length > 0 && (
              <span className="ml-1.5 bg-accent-dim text-accent text-[10px] px-1.5 py-0.5 rounded-full">
                {positions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'positions' && (
          !isConnected && !isDemo ? (
            <EmptyState
              icon={<Wallet className="w-5 h-5" />}
              title={t('wallet_not_connected')}
              subtitle={t('connect_to_trade')}
            />
          ) : positions.length === 0 ? (
            <EmptyState
              icon={<LineChart className="w-5 h-5" />}
              title={t('no_positions')}
              subtitle={t('connect_to_trade')}
            />
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
                  <th className="text-left px-3 py-2 font-medium">Market</th>
                  <th className="text-left px-3 py-2 font-medium">Side</th>
                  <th className="text-right px-3 py-2 font-medium">Size</th>
                  <th className="text-right px-3 py-2 font-medium">Entry</th>
                  <th className="text-right px-3 py-2 font-medium">Mark</th>
                  <th className="text-right px-3 py-2 font-medium">Liq. Price</th>
                  <th className="text-right px-3 py-2 font-medium">PnL</th>
                  <th className="text-right px-3 py-2 font-medium">Collateral</th>
                  <th className="text-center px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(pos => (
                  <PositionRow key={pos.key} position={pos} />
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'orders' && (
          <OrdersTab />
        )}

        {activeTab === 'history' && (
          <TradeHistoryTab />
        )}
      </div>
    </div>
  )
}

function PositionRow({ position }: { position: OnChainPosition }) {
  const [showCloseModal, setShowCloseModal] = useState(false)

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-panel-light transition-colors">
        <td className="px-3 py-2.5 font-medium text-text-primary">{position.market}</td>
        <td className="px-3 py-2.5">
          <span className={cn(
            'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
            position.side === 'long' ? 'bg-long-dim text-long' : 'bg-short-dim text-short'
          )}>
            {position.side} {position.leverage}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(position.size)}</td>
        <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(position.entryPrice)}</td>
        <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(position.markPrice)}</td>
        <td className="px-3 py-2.5 text-right font-mono text-text-muted">${formatUsd(position.liquidationPrice)}</td>
        <td className="px-3 py-2.5 text-right">
          <div className={cn('font-mono font-medium', position.pnl >= 0 ? 'text-long' : 'text-short')}>
            {position.pnl >= 0 ? '+' : ''}${formatUsd(position.pnl)}
          </div>
          <div className={cn('text-[10px] font-mono', position.pnlPercent >= 0 ? 'text-long' : 'text-short')}>
            {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
          </div>
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(position.collateral)}</td>
        <td className="px-3 py-2.5 text-center">
          <button
            onClick={() => setShowCloseModal(true)}
            className="text-[10px] border px-2 py-1 rounded transition-colors cursor-pointer text-short border-short/30 hover:border-short/60 hover:bg-short-dim"
          >
            Close
          </button>
        </td>
      </tr>

      <ClosePositionModal
        open={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        position={position}
      />
    </>
  )
}

/**
 * Confirmation modal for closing (or partially closing) a position.
 *
 * Gates the destructive action behind an explicit click and shows a clear
 * preview of what the user is about to lock in: notional being closed,
 * estimated PnL, fee, and the resulting net cash return. Resets internal
 * state on close so reopening starts at 100% again.
 */
function ClosePositionModal({
  open,
  onClose,
  position,
}: {
  open: boolean
  onClose: () => void
  position: OnChainPosition
}) {
  const { address } = useAccount()
  const { getPrice } = usePrices()
  const { decreasePosition } = useTradeExecution()
  const isDemo = useIsDemo()
  const toast = useToast()
  const [closing, setClosing] = useState(false)
  const [closePct, setClosePct] = useState(100)

  // Reset slider when the modal opens so each close is a fresh decision.
  useEffect(() => {
    if (open) setClosePct(100)
  }, [open])

  const closeSize = position.size * (closePct / 100)
  const closePnl = position.pnl * (closePct / 100)
  const closeFee = closeSize * (FEES.closeFeeBps / 10_000)
  const closedCollateral = position.collateral * (closePct / 100)
  const netReturn = closedCollateral + closePnl - closeFee
  const isFullClose = closePct === 100

  const handleConfirm = useCallback(async () => {
    setClosing(true)
    try {
      if (isDemo) {
        await new Promise(r => setTimeout(r, 500))
        const result = closeDemoPosition(position.key, closePct)
        if (result) {
          toast.success(
            `Closed ${closePct}% of ${position.market}`,
            `P&L: ${result.realizedPnl >= 0 ? '+' : ''}$${formatUsd(Math.abs(result.realizedPnl))} • Fee: $${formatUsd(result.closeFee)}`,
          )
        }
      } else {
        if (!address) return
        const currentPrice = getPrice(position.market)
        if (!currentPrice) return

        const sizeDelta = closePct === 100
          ? position.sizeRaw
          : (position.sizeRaw * BigInt(closePct)) / 100n

        await decreasePosition({
          indexToken: position.indexToken,
          collateralDelta: 0n,
          sizeDelta,
          isLong: position.side === 'long',
          currentPriceRaw: currentPrice.raw,
          receiver: address,
        })
      }
      onClose()
    } finally {
      setClosing(false)
    }
  }, [isDemo, address, position, getPrice, decreasePosition, closePct, toast, onClose])

  return (
    <Modal
      open={open}
      onClose={closing ? () => {} : onClose}
      title={isFullClose ? 'Close position' : 'Reduce position'}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={closing}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={closing}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-short hover:bg-short/90 rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {closing && <Loader2 className="w-3 h-3 animate-spin" />}
            {closing ? 'Closing…' : isFullClose ? `Close all of ${position.market}` : `Close ${closePct}%`}
          </button>
        </>
      }
    >
      {/* Position summary */}
      <div className="bg-surface/50 rounded-lg p-3 mb-4 border border-border/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{position.market}</span>
            <span className={cn(
              'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
              position.side === 'long' ? 'bg-long-dim text-long' : 'bg-short-dim text-short',
            )}>
              {position.side} {position.leverage}
            </span>
          </div>
          <div className="text-right">
            <div className={cn('font-mono text-sm font-semibold', position.pnl >= 0 ? 'text-long' : 'text-short')}>
              {position.pnl >= 0 ? '+' : ''}${formatUsd(position.pnl)}
            </div>
            <div className={cn('text-[10px] font-mono', position.pnlPercent >= 0 ? 'text-long' : 'text-short')}>
              {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <CloseStat label="Size" value={`$${formatUsd(position.size)}`} />
          <CloseStat label="Entry" value={`$${formatUsd(position.entryPrice)}`} />
          <CloseStat label="Mark" value={`$${formatUsd(position.markPrice)}`} />
        </div>
      </div>

      {/* Close % control */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">Close amount</span>
          <span className="text-sm font-mono font-semibold text-text-primary">{closePct}%</span>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          value={closePct}
          onChange={e => setClosePct(Number(e.target.value))}
          className="w-full accent-short h-1 cursor-pointer mb-2"
        />
        <div className="grid grid-cols-4 gap-1.5">
          {[25, 50, 75, 100].map(pct => (
            <button
              key={pct}
              onClick={() => setClosePct(pct)}
              className={cn(
                'text-[11px] py-1.5 rounded transition-colors cursor-pointer font-medium',
                closePct === pct ? 'bg-short text-white' : 'bg-surface text-text-muted hover:bg-panel-light hover:text-text-primary',
              )}
            >
              {pct === 100 ? 'Max' : `${pct}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Estimated outcome */}
      <div className="space-y-1.5 text-xs border-t border-border pt-3">
        <SummaryRow label="Size to close" value={`$${formatUsd(closeSize)}`} />
        <SummaryRow
          label="Realised P&L"
          value={`${closePnl >= 0 ? '+' : ''}$${formatUsd(closePnl)}`}
          valueClassName={closePnl >= 0 ? 'text-long' : 'text-short'}
        />
        <SummaryRow label="Close fee" value={`-$${formatUsd(closeFee)}`} muted />
        <div className="pt-2 mt-2 border-t border-border">
          <SummaryRow
            label="Net return to wallet"
            value={`$${formatUsd(netReturn)}`}
            valueClassName="text-text-primary font-semibold"
            bold
          />
        </div>
      </div>

      {isFullClose && (
        <div className="flex items-start gap-2 mt-3 px-2.5 py-2 bg-amber-400/10 border border-amber-400/30 rounded text-[10px] text-amber-400 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>This closes the entire position. Any pending TP/SL orders for this slot will be cancelled.</span>
        </div>
      )}
    </Modal>
  )
}

function CloseStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className="font-mono text-text-secondary">{value}</div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  valueClassName,
  muted,
  bold,
}: {
  label: string
  value: string
  valueClassName?: string
  muted?: boolean
  bold?: boolean
}) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-text-muted text-[10px] uppercase tracking-wider">{label}</span>
      <span className={cn(
        'font-mono tabular-nums',
        bold ? 'text-sm' : 'text-xs',
        muted && 'text-text-muted',
        valueClassName,
      )}>
        {value}
      </span>
    </div>
  )
}

// ─── Orders Tab (client-side pending orders) ───
// Displays TP/SL (close-side) and Limit (open-side) orders from the shared
// demoData store. Active in both demo and live mode because the contracts
// don't have an on-chain limit order representation.

function OrdersTab() {
  const [orders, setOrders] = useState<DemoOrder[]>([])

  useEffect(() => {
    const id = setInterval(() => setOrders(getDemoOrders()), 500)
    return () => clearInterval(id)
  }, [])

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="w-5 h-5" />}
        title="No pending orders"
        subtitle="Limit orders and TP/SL triggers will appear here. Switch the order form to Limit to queue one."
      />
    )
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
          <th className="text-left px-3 py-2 font-medium">Market</th>
          <th className="text-left px-3 py-2 font-medium">Side</th>
          <th className="text-left px-3 py-2 font-medium">Type</th>
          <th className="text-right px-3 py-2 font-medium">Trigger</th>
          <th className="text-right px-3 py-2 font-medium">Size</th>
          <th className="text-right px-3 py-2 font-medium">Lev.</th>
          <th className="text-right px-3 py-2 font-medium">Created</th>
          <th className="text-center px-3 py-2 font-medium">Cancel</th>
        </tr>
      </thead>
      <tbody>
        {orders.map(order => (
          <tr key={order.id} className="border-b border-border/50 hover:bg-panel-light transition-colors">
            <td className="px-3 py-2.5 font-medium text-text-primary">{order.market}</td>
            <td className="px-3 py-2.5">
              <span className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
                order.side === 'long' ? 'bg-long-dim text-long' : 'bg-short-dim text-short'
              )}>
                {order.side}
              </span>
            </td>
            <td className="px-3 py-2.5">
              <span className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium',
                order.type === 'Take Profit' ? 'bg-long-dim text-long' :
                order.type === 'Stop Loss' ? 'bg-short-dim text-short' :
                'bg-accent-dim text-accent'
              )}>
                {order.type}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(order.triggerPrice)}</td>
            <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(order.size)}</td>
            <td className="px-3 py-2.5 text-right font-mono text-text-muted">
              {order.leverage !== undefined ? `${order.leverage}x` : '—'}
            </td>
            <td className="px-3 py-2.5 text-right text-text-muted">{new Date(order.createdAt).toLocaleTimeString()}</td>
            <td className="px-3 py-2.5 text-center">
              <button
                onClick={() => cancelDemoOrder(order.id)}
                className="text-[10px] text-text-muted hover:text-short border border-border hover:border-short/30 px-2 py-1 rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Trade History Tab ───
// Demo: polls demo store every 500ms.
// Live: useTradeHistory backfills + polls PositionManager events.

function TradeHistoryTab() {
  const isDemo = useIsDemo()
  return isDemo ? <DemoTradeHistoryTable /> : <LiveTradeHistoryTable />
}

function DemoTradeHistoryTable() {
  const [history, setHistory] = useState<DemoTradeHistory[]>([])

  useEffect(() => {
    const id = setInterval(() => setHistory(getDemoHistory()), 500)
    return () => clearInterval(id)
  }, [])

  const totalPnl = history.reduce((sum, t) => sum + t.realizedPnl, 0)
  const totalFees = history.reduce((sum, t) => sum + t.fee, 0)

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border text-[10px]">
        <div>
          <span className="text-text-muted">Total P&L:</span>
          <span className={cn('ml-1 font-mono font-medium', totalPnl >= 0 ? 'text-long' : 'text-short')}>
            {totalPnl >= 0 ? '+' : ''}${formatUsd(totalPnl)}
          </span>
        </div>
        <div>
          <span className="text-text-muted">Fees:</span>
          <span className="ml-1 font-mono text-text-secondary">${formatUsd(totalFees)}</span>
        </div>
        <div>
          <span className="text-text-muted">Net:</span>
          <span className={cn('ml-1 font-mono font-medium', (totalPnl - totalFees) >= 0 ? 'text-long' : 'text-short')}>
            {(totalPnl - totalFees) >= 0 ? '+' : ''}${formatUsd(totalPnl - totalFees)}
          </span>
        </div>
        <div>
          <span className="text-text-muted">Trades:</span>
          <span className="ml-1 font-mono text-text-primary">{history.length}</span>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="py-8">
          <EmptyState
            icon={<HistoryIcon className="w-5 h-5" />}
            title="No trade history yet"
            subtitle="Close a position to see realised P&L and fill details here."
          />
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
              <th className="text-left px-3 py-2 font-medium">Time</th>
              <th className="text-left px-3 py-2 font-medium">Market</th>
              <th className="text-left px-3 py-2 font-medium">Side</th>
              <th className="text-right px-3 py-2 font-medium">Size</th>
              <th className="text-right px-3 py-2 font-medium">Entry</th>
              <th className="text-right px-3 py-2 font-medium">Close</th>
              <th className="text-right px-3 py-2 font-medium">P&L</th>
              <th className="text-right px-3 py-2 font-medium">Fee</th>
            </tr>
          </thead>
          <tbody>
            {history.map(trade => (
              <tr key={trade.id} className="border-b border-border/50 hover:bg-panel-light transition-colors">
                <td className="px-3 py-2.5 text-text-muted">{formatTimeAgo(trade.time)}</td>
                <td className="px-3 py-2.5 font-medium text-text-primary">{trade.market}</td>
                <td className="px-3 py-2.5">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
                    trade.side === 'long' ? 'bg-long-dim text-long' : 'bg-short-dim text-short'
                  )}>
                    {trade.side}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(trade.size)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(trade.entryPrice)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(trade.closePrice)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={cn('font-mono font-medium', trade.realizedPnl >= 0 ? 'text-long' : 'text-short')}>
                    {trade.realizedPnl >= 0 ? '+' : ''}${formatUsd(trade.realizedPnl)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-text-muted">${formatUsd(trade.fee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// ─── Live trade history table (sourced from chain events) ─────────────────

function LiveTradeHistoryTable() {
  const { isConnected } = useAccount()
  const { history, isLoading } = useTradeHistory()

  const totalPnl = history.reduce((sum, t) => sum + t.realizedPnl, 0)
  const totalFees = history.reduce((sum, t) => sum + t.fee, 0)

  if (!isConnected) {
    return (
      <EmptyState
        icon={<Wallet className="w-5 h-5" />}
        title="Wallet not connected"
        subtitle="Connect a wallet from the header to view your fill history."
      />
    )
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border text-[10px]">
        <div>
          <span className="text-text-muted">Realised P&L:</span>
          <span className={cn('ml-1 font-mono font-medium', totalPnl >= 0 ? 'text-long' : 'text-short')}>
            {totalPnl >= 0 ? '+' : ''}${formatUsd(totalPnl)}
          </span>
        </div>
        <div>
          <span className="text-text-muted">Fees:</span>
          <span className="ml-1 font-mono text-text-secondary">${formatUsd(totalFees)}</span>
        </div>
        <div>
          <span className="text-text-muted">Net:</span>
          <span className={cn('ml-1 font-mono font-medium', (totalPnl - totalFees) >= 0 ? 'text-long' : 'text-short')}>
            {(totalPnl - totalFees) >= 0 ? '+' : ''}${formatUsd(totalPnl - totalFees)}
          </span>
        </div>
        <div>
          <span className="text-text-muted">Fills:</span>
          <span className="ml-1 font-mono text-text-primary">{history.length}</span>
        </div>
        {isLoading && history.length === 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-text-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading...
          </div>
        )}
      </div>

      {history.length === 0 ? (
        isLoading ? (
          <div className="flex items-center justify-center py-8 text-text-muted text-xs gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading history…
          </div>
        ) : (
          <div className="py-8">
            <EmptyState
              icon={<HistoryIcon className="w-5 h-5" />}
              title="No fills yet"
              subtitle="Your opened and closed positions will appear here once you start trading."
            />
          </div>
        )
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
              <th className="text-left px-3 py-2 font-medium">Time</th>
              <th className="text-left px-3 py-2 font-medium">Market</th>
              <th className="text-left px-3 py-2 font-medium">Side</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
              <th className="text-right px-3 py-2 font-medium">Size</th>
              <th className="text-right px-3 py-2 font-medium">Price</th>
              <th className="text-right px-3 py-2 font-medium">P&L</th>
              <th className="text-right px-3 py-2 font-medium">Fee</th>
            </tr>
          </thead>
          <tbody>
            {history.map(entry => (
              <LiveHistoryRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LiveHistoryRow({ entry }: { entry: TradeHistoryEntry }) {
  const kindLabel = entry.kind === 'open' ? 'Open' : entry.kind === 'close' ? 'Close' : 'Liq'
  const kindColor =
    entry.kind === 'open'
      ? 'bg-accent-dim text-accent'
      : entry.kind === 'liquidation'
        ? 'bg-short-dim text-short'
        : 'bg-surface text-text-muted'

  return (
    <tr className="border-b border-border/50 hover:bg-panel-light transition-colors">
      <td className="px-3 py-2.5 text-text-muted">{formatTimeAgo(entry.time)}</td>
      <td className="px-3 py-2.5 font-medium text-text-primary">{entry.market}</td>
      <td className="px-3 py-2.5">
        <span className={cn(
          'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
          entry.side === 'long' ? 'bg-long-dim text-long' : 'bg-short-dim text-short'
        )}>
          {entry.side}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', kindColor)}>
          {kindLabel}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(entry.size)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(entry.price)}</td>
      <td className="px-3 py-2.5 text-right">
        {entry.kind === 'open' ? (
          <span className="font-mono text-text-muted">—</span>
        ) : (
          <span className={cn('font-mono font-medium', entry.realizedPnl >= 0 ? 'text-long' : 'text-short')}>
            {entry.realizedPnl >= 0 ? '+' : ''}${formatUsd(entry.realizedPnl)}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-text-muted">${formatUsd(entry.fee)}</td>
    </tr>
  )
}
