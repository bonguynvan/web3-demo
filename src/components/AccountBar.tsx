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
import { useIsDemo } from '../store/modeStore'
import { cn, formatUsd } from '../lib/format'
import { FlashPrice } from './ui/FlashPrice'
import { Skeleton } from './ui/Skeleton'
import { Tooltip } from './ui/Tooltip'

export function AccountBar() {
  const { isConnected } = useAccount()
  const { dollars: usdcBalance, isFetched: balanceFetched } = useUsdcBalance()
  const { positions } = usePositions()
  const isDemo = useIsDemo()

  // Initial load = live mode, connected, but wagmi hasn't completed the first
  // balanceOf read yet. Demo mode is synchronous so always "loaded".
  const isInitialLoad = !isDemo && isConnected && !balanceFetched

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
    <div className="flex items-center h-8 bg-panel/80 border-b border-border px-3 md:px-4 gap-3 md:gap-6 text-[11px] shrink-0 overflow-x-auto scrollbar-thin">
      {/* Total Equity */}
      <div className="flex items-center gap-1.5">
        <Tooltip
          title="Equity"
          content="Total account value: free USDC + collateral locked in open positions + unrealized PnL. This is what your account would be worth if you closed everything at the current mark price."
          side="bottom"
        >
          <span className="text-text-muted cursor-help">Equity</span>
        </Tooltip>
        {isInitialLoad ? (
          <Skeleton className="h-3" width={70} subtle />
        ) : (
          <FlashPrice
            value={totalEquity}
            format={n => `$${formatUsd(n)}`}
            size="sm"
            className="font-medium"
          />
        )}
      </div>

      <Divider hideOnMobile />

      {/* Available — hidden on mobile, equity covers the headline number */}
      <div className="hidden md:flex items-center gap-1.5">
        <span className="text-text-muted">Available</span>
        {isInitialLoad ? (
          <Skeleton className="h-3" width={60} subtle />
        ) : (
          <span className="font-mono text-text-primary">${formatUsd(availableBalance)}</span>
        )}
      </div>

      <Divider />

      {/* Margin Used */}
      <div className="flex items-center gap-1.5">
        <Tooltip
          title="Margin used"
          content="USDC locked as collateral across all your open positions. As the margin usage % approaches 100, your account is closer to liquidation."
          side="bottom"
        >
          <span className="text-text-muted cursor-help">Margin</span>
        </Tooltip>
        {isInitialLoad ? (
          <Skeleton className="h-3" width={48} subtle />
        ) : (
          <>
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
          </>
        )}
      </div>

      <Divider />

      {/* Unrealized PnL */}
      <div className="flex items-center gap-1.5">
        <Tooltip
          title="Unrealized P&L"
          content="Profit or loss on open positions if they were closed at the current mark price. Becomes 'realized' (and added to your balance) only when you actually close the position."
          side="bottom"
        >
          <span className="text-text-muted cursor-help">Unrealized</span>
        </Tooltip>
        {isInitialLoad ? (
          <Skeleton className="h-3" width={56} subtle />
        ) : (
          <FlashPrice
            value={totalUnrealizedPnl}
            format={n => `${n >= 0 ? '+' : ''}$${formatUsd(Math.abs(n))}`}
            size="sm"
            className={cn('font-medium', totalUnrealizedPnl >= 0 ? 'text-long' : 'text-short')}
          />
        )}
      </div>

      <Divider hideOnMobile />

      {/* Daily PnL — hidden on mobile (less critical for fast trading) */}
      <div className="hidden md:flex items-center gap-1.5">
        <span className="text-text-muted">Daily P&L</span>
        {isInitialLoad ? (
          <Skeleton className="h-3" width={56} subtle />
        ) : (
          <span className={cn('font-mono', dailyPnl >= 0 ? 'text-long' : 'text-short')}>
            {dailyPnl >= 0 ? '+' : ''}${formatUsd(Math.abs(dailyPnl))}
          </span>
        )}
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

function Divider({ hideOnMobile }: { hideOnMobile?: boolean } = {}) {
  return <div className={cn('w-px h-3 bg-border', hideOnMobile && 'hidden md:block')} />
}
