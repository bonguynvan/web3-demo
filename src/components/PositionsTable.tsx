import { useState, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { Loader2 } from 'lucide-react'
import { usePositions, type OnChainPosition } from '../hooks/usePositions'
import { usePrices } from '../hooks/usePrices'
import { useTradeExecution } from '../hooks/useTradeExecution'
import { cn } from '../lib/format'

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
          <div className="flex items-center justify-center h-full text-text-muted text-xs">
            No open orders (AMM — orders execute instantly)
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex items-center justify-center h-full text-text-muted text-xs">
            Trade history will be available with the backend server (Phase 7b)
          </div>
        )}
      </div>
    </div>
  )
}

function PositionRow({ position }: { position: OnChainPosition }) {
  const { address } = useAccount()
  const { getPrice } = usePrices()
  const { decreasePosition, status } = useTradeExecution()
  const [closing, setClosing] = useState(false)

  const formatUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const handleClose = useCallback(async () => {
    if (!address) return
    const currentPrice = getPrice(position.market)
    if (!currentPrice) return

    setClosing(true)
    try {
      await decreasePosition({
        indexToken: position.indexToken,
        collateralDelta: 0n, // Full close: auto-return collateral
        sizeDelta: position.sizeRaw,
        isLong: position.side === 'long',
        currentPriceRaw: currentPrice.raw,
        receiver: address,
      })
    } finally {
      setClosing(false)
    }
  }, [address, position, getPrice, decreasePosition])

  return (
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
          onClick={handleClose}
          disabled={closing}
          className="text-[10px] text-short hover:text-short/80 border border-short/30 hover:border-short/60 px-2 py-1 rounded transition-colors cursor-pointer disabled:opacity-50"
        >
          {closing ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Close'}
        </button>
      </td>
    </tr>
  )
}
