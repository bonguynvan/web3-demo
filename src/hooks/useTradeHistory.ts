/**
 * useTradeHistory — per-user trade history sourced from the backend.
 *
 * Live mode: GET /api/positions/:address every REFRESH_MS, map the indexed
 *            history into the existing `TradeHistoryEntry` shape.
 * Demo mode: returns an empty list (the History tab uses the demo store
 *            in demo mode and never calls this hook).
 *
 * The previous implementation scanned PositionManager events client-side
 * via `getLogs`, which capped at LOOKBACK_BLOCKS and made one batch request
 * per refresh. The backend already has the full history indexed, so we
 * just ask for it.
 */

import { useEffect, useState, useMemo, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useIsDemo } from '../store/modeStore'
import { useTradingStore } from '../store/tradingStore'
import { apiClient, type UserPositionsDto } from '../lib/apiClient'

const REFRESH_MS = 10_000

export type TradeHistoryKind = 'open' | 'close' | 'liquidation'

export interface TradeHistoryEntry {
  id: string
  blockNumber: bigint
  time: number
  market: string
  side: 'long' | 'short'
  kind: TradeHistoryKind
  /** Notional size in USD */
  size: number
  /** Execution price in USD */
  price: number
  /** Realised PnL in USD (closes / liquidations only; 0 for opens) */
  realizedPnl: number
  /** Fee paid in USD */
  fee: number
}

export function useTradeHistory(): {
  history: TradeHistoryEntry[]
  isLoading: boolean
} {
  const isDemo = useIsDemo()
  const { address } = useAccount()
  const recentTrades = useTradingStore(s => s.recentTrades)

  const [history, setHistory] = useState<TradeHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Trigger an immediate refetch when a new fill arrives in the live tape —
  // saves up to REFRESH_MS of staleness on the History tab right after the
  // user opens or closes a position.
  const lastTradeIdRef = useRef<string | null>(recentTrades[0]?.id ?? null)
  const [refetchKey, setRefetchKey] = useState(0)
  useEffect(() => {
    const newest = recentTrades[0]
    if (newest && newest.id !== lastTradeIdRef.current) {
      lastTradeIdRef.current = newest.id
      setRefetchKey(k => k + 1)
    }
  }, [recentTrades])

  useEffect(() => {
    if (isDemo) {
      setHistory([])
      return
    }
    if (!address) {
      setHistory([])
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const refresh = async () => {
      if (cancelled) return
      setIsLoading(true)

      const res = await apiClient.getUserPositions(address)
      if (cancelled) {
        return
      }
      if (res.success) {
        setHistory(toEntries(res.data))
      }
      // On failure keep the previous list — better than blanking the table.

      setIsLoading(false)
      if (!cancelled) {
        timer = setTimeout(refresh, REFRESH_MS)
      }
    }

    refresh()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [isDemo, address, refetchKey])

  return useMemo(() => ({ history, isLoading }), [history, isLoading])
}

// ─── Mapping ───────────────────────────────────────────────────────────────

function toEntries(data: UserPositionsDto): TradeHistoryEntry[] {
  // Server returns history newest-first; we keep the same order.
  return data.history.map((row, i) => {
    const market = row.token === 'ETH' ? 'ETH-PERP' : row.token === 'BTC' ? 'BTC-PERP' : row.token
    const side: 'long' | 'short' = row.isLong ? 'long' : 'short'
    const kind: TradeHistoryKind =
      row.eventType === 'increase' ? 'open' :
      row.eventType === 'liquidate' ? 'liquidation' :
      'close'

    // Realised PnL:
    //   opens        — no realisation (collateral added to position)
    //   closes       — usdcOut - collateralDelta - fee (the residual after
    //                  the contract pays back the user)
    //   liquidations — user loses their collateral (the residual goes to
    //                  the fee receiver, not them)
    const realizedPnl =
      kind === 'open' ? 0 :
      kind === 'liquidation' ? -row.collateralDelta :
      row.usdcOut - row.collateralDelta - row.fee

    return {
      // Stable per-fetch key — id resets on every refetch but that's fine
      // because the History tab doesn't preserve scroll position across loads.
      id: `${row.txHash}-${i}`,
      blockNumber: 0n,
      time: row.timestamp * 1000,
      market,
      side,
      kind,
      size: row.sizeDelta,
      price: row.price,
      realizedPnl,
      fee: row.fee,
    }
  })
}
