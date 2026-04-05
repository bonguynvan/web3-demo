import { useState } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { cn, formatUsd } from '../lib/format'
import { useThrottledValue } from '../lib/useThrottledValue'
import { useRenderCount } from '../lib/useRenderCount'

type Tab = 'positions' | 'orders' | 'history'

export function PositionsTable() {
  useRenderCount('PositionsTable')
  const rawPositions = useTradingStore(s => s.positions)
  const positions = useThrottledValue(rawPositions)
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
                <th className="text-right px-3 py-2 font-medium">Margin</th>
                <th className="text-center px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(pos => (
                <tr key={pos.id} className="border-b border-border/50 hover:bg-panel-light transition-colors">
                  <td className="px-3 py-2.5 font-medium text-text-primary">{pos.market}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
                      pos.side === 'long' ? 'bg-long-dim text-long' : 'bg-short-dim text-short'
                    )}>
                      {pos.side} {pos.leverage}x
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-secondary">{pos.size}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(pos.entryPrice)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(pos.markPrice)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-muted">${formatUsd(pos.liquidationPrice)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className={cn('font-mono font-medium', pos.unrealizedPnl >= 0 ? 'text-long' : 'text-short')}>
                      {pos.unrealizedPnl >= 0 ? '+' : ''}${formatUsd(pos.unrealizedPnl)}
                    </div>
                    <div className={cn('text-[10px] font-mono', pos.unrealizedPnlPercent >= 0 ? 'text-long' : 'text-short')}>
                      {pos.unrealizedPnlPercent >= 0 ? '+' : ''}{pos.unrealizedPnlPercent}%
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-secondary">${formatUsd(pos.margin)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <button className="text-[10px] text-short hover:text-short/80 border border-short/30 hover:border-short/60 px-2 py-1 rounded transition-colors cursor-pointer">
                      Close
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'orders' && (
          <div className="flex items-center justify-center h-full text-text-muted text-xs">
            No open orders
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex items-center justify-center h-full text-text-muted text-xs">
            No trade history
          </div>
        )}
      </div>
    </div>
  )
}
