import { useState, useCallback, useMemo, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { Loader2 } from 'lucide-react'
import { usePositions, type OnChainPosition } from '../hooks/usePositions'
import { usePrices } from '../hooks/usePrices'
import { useTradeExecution } from '../hooks/useTradeExecution'
import { cn, formatUsd } from '../lib/format'
import { useIsDemo } from '../store/modeStore'
import { closeDemoPosition, getDemoOrders, cancelDemoOrder, getDemoHistory, type DemoOrder, type DemoTradeHistory } from '../lib/demoData'
import { useToast } from '../store/toastStore'

type Tab = 'positions' | 'orders' | 'history'

export function PositionsTable() {
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
            <div className="flex items-center justify-center h-full text-text-muted text-xs">
              Connect wallet to view positions
            </div>
          ) : positions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-text-muted text-xs">
              No open positions
            </div>
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
  const { address } = useAccount()
  const { getPrice } = usePrices()
  const { decreasePosition } = useTradeExecution()
  const isDemo = useIsDemo()
  const toast = useToast()
  const [closing, setClosing] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [closePct, setClosePct] = useState(100)

  const handleClose = useCallback(async () => {
    setClosing(true)
    try {
      if (isDemo) {
        // Demo mode — close from demo store
        await new Promise(r => setTimeout(r, 500))
        const result = closeDemoPosition(position.key, closePct)
        if (result) {
          toast.success(
            `Closed ${closePct}% of ${position.market}`,
            `P&L: ${result.realizedPnl >= 0 ? '+' : ''}$${formatUsd(Math.abs(result.realizedPnl))} • Fee: $${formatUsd(result.closeFee)}`
          )
        }
      } else {
        // Live mode
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
      setShowClose(false)
    } finally {
      setClosing(false)
    }
  }, [isDemo, address, position, getPrice, decreasePosition, closePct, toast])

  const closeSize = position.size * closePct / 100
  const closePnl = position.pnl * closePct / 100

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
            onClick={() => setShowClose(v => !v)}
            className={cn(
              'text-[10px] border px-2 py-1 rounded transition-colors cursor-pointer',
              showClose
                ? 'text-accent border-accent/30 bg-accent-dim'
                : 'text-short border-short/30 hover:border-short/60 hover:text-short/80'
            )}
          >
            Close
          </button>
        </td>
      </tr>

      {/* Expanded close panel */}
      {showClose && (
        <tr className="border-b border-border bg-panel-light/50">
          <td colSpan={9} className="px-3 py-2">
            <div className="flex items-center gap-4">
              {/* Close % presets */}
              <div className="flex items-center gap-1">
                {[25, 50, 75, 100].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setClosePct(pct)}
                    className={cn(
                      'text-[10px] px-2 py-1 rounded transition-colors cursor-pointer',
                      closePct === pct ? 'bg-short text-white' : 'bg-surface text-text-muted hover:text-text-primary'
                    )}
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Slider */}
              <input
                type="range"
                min={1}
                max={100}
                value={closePct}
                onChange={e => setClosePct(Number(e.target.value))}
                className="flex-1 accent-short h-1 cursor-pointer"
              />

              {/* Close info */}
              <div className="text-[10px] text-text-muted font-mono">
                ${formatUsd(closeSize)} size
              </div>
              <div className={cn('text-[10px] font-mono font-medium', closePnl >= 0 ? 'text-long' : 'text-short')}>
                {closePnl >= 0 ? '+' : ''}${formatUsd(closePnl)} PnL
              </div>

              {/* Execute */}
              <button
                onClick={handleClose}
                disabled={closing}
                className="text-[10px] bg-short text-white px-3 py-1 rounded hover:bg-short/80 transition-colors cursor-pointer disabled:opacity-50"
              >
                {closing ? <Loader2 className="w-3 h-3 animate-spin inline" /> : `Close ${closePct}%`}
              </button>
              <button
                onClick={() => setShowClose(false)}
                className="text-[10px] text-text-muted hover:text-text-primary cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Orders Tab (live from demo store) ───

function OrdersTab() {
  const [orders, setOrders] = useState<DemoOrder[]>([])

  useEffect(() => {
    const id = setInterval(() => setOrders(getDemoOrders()), 500)
    return () => clearInterval(id)
  }, [])

  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-xs">
        No open orders — set TP/SL when opening a position
      </div>
    )
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
          <th className="text-left px-3 py-2 font-medium">Market</th>
          <th className="text-left px-3 py-2 font-medium">Type</th>
          <th className="text-right px-3 py-2 font-medium">Trigger</th>
          <th className="text-right px-3 py-2 font-medium">Size</th>
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
                'px-2 py-0.5 rounded text-[10px] font-medium',
                order.type === 'Take Profit' ? 'bg-long-dim text-long' : 'bg-short-dim text-short'
              )}>
                {order.type}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(order.triggerPrice)}</td>
            <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(order.size)}</td>
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

// ─── Trade History Tab (live from demo store) ───

function TradeHistoryTab() {
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
        <div className="flex items-center justify-center py-8 text-text-muted text-xs">
          No trade history yet — close a position to see it here
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
