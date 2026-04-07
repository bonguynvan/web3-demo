import { useState, useCallback, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { Loader2 } from 'lucide-react'
import { usePositions, type OnChainPosition } from '../hooks/usePositions'
import { usePrices } from '../hooks/usePrices'
import { useTradeExecution } from '../hooks/useTradeExecution'
import { cn, formatUsd } from '../lib/format'

type Tab = 'positions' | 'orders' | 'history'

export function PositionsTable() {
  const { isConnected } = useAccount()
  const { positions } = usePositions()
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
          !isConnected ? (
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
  const [closing, setClosing] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [closePct, setClosePct] = useState(100)

  const handleClose = useCallback(async () => {
    if (!address) return
    const currentPrice = getPrice(position.market)
    if (!currentPrice) return

    setClosing(true)
    try {
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
      setShowClose(false)
    } finally {
      setClosing(false)
    }
  }, [address, position, getPrice, decreasePosition, closePct])

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

// ─── Orders Tab (TP/SL pending orders) ───

function OrdersTab() {
  // Demo: show some pending TP/SL orders
  const demoOrders = useMemo(() => [
    { id: '1', market: 'ETH-PERP', side: 'long' as const, type: 'Take Profit', triggerPrice: 3650, size: 5000, createdAt: Date.now() - 3600000 },
    { id: '2', market: 'ETH-PERP', side: 'long' as const, type: 'Stop Loss', triggerPrice: 3280, size: 5000, createdAt: Date.now() - 3600000 },
    { id: '3', market: 'BTC-PERP', side: 'short' as const, type: 'Take Profit', triggerPrice: 64500, size: 12000, createdAt: Date.now() - 7200000 },
  ], [])

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
        {demoOrders.map(order => (
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
              <button className="text-[10px] text-text-muted hover:text-short border border-border hover:border-short/30 px-2 py-1 rounded transition-colors cursor-pointer">
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

interface TradeHistory {
  id: string
  market: string
  side: 'long' | 'short'
  action: 'Open' | 'Close' | 'Liquidated'
  size: number
  entryPrice: number
  closePrice: number
  realizedPnl: number
  fee: number
  time: number
}

function TradeHistoryTab() {
  const demoHistory: TradeHistory[] = useMemo(() => [
    { id: '1', market: 'ETH-PERP', side: 'long', action: 'Close', size: 8500, entryPrice: 3412.50, closePrice: 3498.20, realizedPnl: 213.45, fee: 8.50, time: Date.now() - 1800000 },
    { id: '2', market: 'BTC-PERP', side: 'short', action: 'Close', size: 15000, entryPrice: 68950, closePrice: 68200, realizedPnl: 163.20, fee: 15.00, time: Date.now() - 5400000 },
    { id: '3', market: 'ETH-PERP', side: 'long', action: 'Liquidated', size: 3200, entryPrice: 3520.80, closePrice: 3388.15, realizedPnl: -1206.40, fee: 5.00, time: Date.now() - 14400000 },
    { id: '4', market: 'ETH-PERP', side: 'short', action: 'Close', size: 6000, entryPrice: 3455.00, closePrice: 3390.50, realizedPnl: 112.08, fee: 6.00, time: Date.now() - 28800000 },
    { id: '5', market: 'BTC-PERP', side: 'long', action: 'Close', size: 22000, entryPrice: 67800, closePrice: 68450, realizedPnl: 210.91, fee: 22.00, time: Date.now() - 43200000 },
    { id: '6', market: 'ETH-PERP', side: 'long', action: 'Close', size: 4500, entryPrice: 3380.25, closePrice: 3412.75, realizedPnl: 43.28, fee: 4.50, time: Date.now() - 64800000 },
    { id: '7', market: 'BTC-PERP', side: 'short', action: 'Close', size: 9000, entryPrice: 69100, closePrice: 69350, realizedPnl: -32.56, fee: 9.00, time: Date.now() - 86400000 },
  ], [])

  const totalPnl = demoHistory.reduce((sum, t) => sum + t.realizedPnl, 0)
  const totalFees = demoHistory.reduce((sum, t) => sum + t.fee, 0)

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
          <span className="ml-1 font-mono text-text-primary">{demoHistory.length}</span>
        </div>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
            <th className="text-left px-3 py-2 font-medium">Time</th>
            <th className="text-left px-3 py-2 font-medium">Market</th>
            <th className="text-left px-3 py-2 font-medium">Side</th>
            <th className="text-left px-3 py-2 font-medium">Action</th>
            <th className="text-right px-3 py-2 font-medium">Size</th>
            <th className="text-right px-3 py-2 font-medium">Entry</th>
            <th className="text-right px-3 py-2 font-medium">Close</th>
            <th className="text-right px-3 py-2 font-medium">P&L</th>
            <th className="text-right px-3 py-2 font-medium">Fee</th>
          </tr>
        </thead>
        <tbody>
          {demoHistory.map(trade => (
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
              <td className="px-3 py-2.5">
                <span className={cn(
                  'text-[10px]',
                  trade.action === 'Liquidated' ? 'text-short font-medium' : 'text-text-secondary'
                )}>
                  {trade.action}
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
