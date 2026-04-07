/**
 * AccountBar — always-visible account summary strip.
 *
 * Shows: Total Equity, Available Balance, Margin Used, Unrealized PnL, Daily PnL.
 * Only visible when a wallet is connected.
 * Uses demo data for unrealized PnL from positions and daily PnL tracking.
 */

import { useMemo, useRef, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { useUsdcBalance } from '../hooks/useTokenBalance'
import { usePositions } from '../hooks/usePositions'
import { cn, formatUsd } from '../lib/format'
import { FlashPrice } from './ui/FlashPrice'

export function AccountBar() {
  const { isConnected } = useAccount()
  const { dollars: usdcBalance } = useUsdcBalance()
  const { positions } = usePositions()

  // Aggregate position data
  const { totalMargin, totalUnrealizedPnl } = useMemo(() => {
    let margin = 0
    let pnl = 0
    for (const pos of positions) {
      margin += pos.collateral
      pnl += pos.pnl
    }
    return { totalMargin: margin, totalUnrealizedPnl: pnl }
  }, [positions])

  // Total equity = available USDC + margin locked in positions + unrealized PnL
  const totalEquity = usdcBalance + totalMargin + totalUnrealizedPnl
  const availableBalance = usdcBalance
  const marginUsed = totalMargin
  const marginUsedPercent = totalEquity > 0 ? (marginUsed / totalEquity) * 100 : 0

  // Track daily PnL (accumulates within the session, resets on page reload)
  const [dailyPnl, setDailyPnl] = useState(0)
  const lastPnlRef = useRef(totalUnrealizedPnl)

  useEffect(() => {
    const delta = totalUnrealizedPnl - lastPnlRef.current
    if (Math.abs(delta) > 0.01) {
      setDailyPnl(prev => prev + delta * 0.1) // drift slowly for visual
    }
    lastPnlRef.current = totalUnrealizedPnl
  }, [totalUnrealizedPnl])

  if (!isConnected) return null

  return (
    <div className="flex items-center h-8 bg-panel/80 border-b border-border px-4 gap-6 text-[11px] shrink-0">
      {/* Total Equity */}
      <div className="flex items-center gap-1.5">
        <span className="text-text-muted">Equity</span>
        <FlashPrice
          value={totalEquity}
          format={n => `$${formatUsd(n)}`}
          size="sm"
          className="font-medium"
        />
      </div>

      <Divider />

      {/* Available */}
      <div className="flex items-center gap-1.5">
        <span className="text-text-muted">Available</span>
        <span className="font-mono text-text-primary">${formatUsd(availableBalance)}</span>
      </div>

      <Divider />

      {/* Margin Used */}
      <div className="flex items-center gap-1.5">
        <span className="text-text-muted">Margin</span>
        <span className="font-mono text-text-primary">${formatUsd(marginUsed)}</span>
        {marginUsedPercent > 0 && (
          <span className={cn(
            'text-[9px] px-1 rounded font-mono',
            marginUsedPercent > 80 ? 'bg-short-dim text-short' :
            marginUsedPercent > 50 ? 'bg-amber-400/10 text-amber-400' :
            'bg-surface text-text-muted'
          )}>
            {marginUsedPercent.toFixed(0)}%
          </span>
        )}
      </div>

      <Divider />

      {/* Unrealized PnL */}
      <div className="flex items-center gap-1.5">
        <span className="text-text-muted">Unrealized</span>
        <FlashPrice
          value={totalUnrealizedPnl}
          format={n => `${n >= 0 ? '+' : ''}$${formatUsd(Math.abs(n))}`}
          size="sm"
          className={cn('font-medium', totalUnrealizedPnl >= 0 ? 'text-long' : 'text-short')}
        />
      </div>

      <Divider />

      {/* Daily PnL */}
      <div className="flex items-center gap-1.5">
        <span className="text-text-muted">Daily P&L</span>
        <span className={cn('font-mono', dailyPnl >= 0 ? 'text-long' : 'text-short')}>
          {dailyPnl >= 0 ? '+' : ''}${formatUsd(Math.abs(dailyPnl))}
        </span>
      </div>

      <div className="flex-1" />

      {/* Positions count */}
      {positions.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">Positions</span>
          <span className="bg-accent-dim text-accent text-[10px] px-1.5 py-0.5 rounded-full font-medium">
            {positions.length}
          </span>
        </div>
      )}

      {/* Account health bar */}
      {marginUsed > 0 && (
        <div className="flex items-center gap-1.5 w-24">
          <div className="flex-1 h-1 bg-surface rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                marginUsedPercent > 80 ? 'bg-short' :
                marginUsedPercent > 50 ? 'bg-amber-400' :
                'bg-long'
              )}
              style={{ width: `${Math.min(marginUsedPercent, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Divider() {
  return <div className="w-px h-3 bg-border" />
}
