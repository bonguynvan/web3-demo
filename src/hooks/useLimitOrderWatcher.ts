/**
 * useLimitOrderWatcher — auto-triggers pending limit orders when the
 * oracle price crosses the limit threshold.
 *
 * Runs as a global singleton (mounted once in App.tsx). Polls the shared
 * demo orders store every POLL_MS, and for each pending Limit order checks
 * whether the current price satisfies the fill condition:
 *
 *   long  → fill when price <= trigger  (buy at or below target)
 *   short → fill when price >= trigger  (sell at or above target)
 *
 * If a limit is placed on the "wrong side" of the market (e.g. long limit
 * above market, which is really a stop-buy), the condition is already met
 * and the order fills immediately. That matches what the user's intent
 * "buy at this price or better" expresses and avoids rejecting legitimate
 * orders.
 *
 * Execution:
 *   demo  → addDemoPosition at the trigger price, then cancelDemoOrder
 *   live  → useTradeExecution.increasePosition, then cancelDemoOrder
 *
 * Re-entry guard: triggeringIds ref tracks in-flight fills so the same
 * order can't fire twice while its transaction is confirming. A failed
 * fill leaves the order in place for manual intervention (cancel button).
 */

import { useEffect, useRef } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useIsDemo } from '../store/modeStore'
import { usePrices } from './usePrices'
import { useTradeExecution } from './useTradeExecution'
import { useToast } from '../store/toastStore'
import {
  getDemoOrders,
  cancelDemoOrder,
  addDemoPosition,
  type DemoOrder,
} from '../lib/demoData'
import { getContracts, getMarkets } from '../lib/contracts'
import { formatUsd } from '../lib/format'

const POLL_MS = 1000

/** Extract 'ETH' from 'ETH-PERP'. Falls back to the raw symbol on weird input. */
function baseAssetFromSymbol(symbol: string): string {
  const dash = symbol.indexOf('-')
  return dash > 0 ? symbol.slice(0, dash) : symbol
}

export function useLimitOrderWatcher(): void {
  const isDemo = useIsDemo()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { getPrice } = usePrices()
  const { increasePosition } = useTradeExecution()
  const toast = useToast()

  // Refs so the effect doesn't restart on every price tick or wallet change
  // that isn't structurally relevant.
  const getPriceRef = useRef(getPrice)
  const increasePositionRef = useRef(increasePosition)
  const toastRef = useRef(toast)
  getPriceRef.current = getPrice
  increasePositionRef.current = increasePosition
  toastRef.current = toast

  const triggeringIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      if (cancelled) return

      const orders = getDemoOrders().filter(
        (o: DemoOrder) => o.type === 'Limit' && !triggeringIds.current.has(o.id),
      )
      if (orders.length === 0) return

      for (const order of orders) {
        if (cancelled) return

        const priceData = getPriceRef.current(order.market)
        if (!priceData || priceData.price <= 0) continue

        const currentPrice = priceData.price
        const shouldFill =
          order.side === 'long'
            ? currentPrice <= order.triggerPrice
            : currentPrice >= order.triggerPrice

        if (!shouldFill) continue

        // Reserve the ID so a retriggering tick can't double-fire.
        triggeringIds.current.add(order.id)

        try {
          if (isDemo) {
            await fillDemoLimit(order)
          } else if (isConnected && address) {
            await fillLiveLimit(
              order,
              chainId,
              address,
              priceData.raw,
              increasePositionRef.current,
            )
          } else {
            // Live mode but wallet disconnected — leave the order alone.
            triggeringIds.current.delete(order.id)
            continue
          }

          if (cancelled) return
          cancelDemoOrder(order.id)
          toastRef.current.success(
            'Limit order filled',
            `${order.side === 'long' ? 'Long' : 'Short'} ${baseAssetFromSymbol(order.market)} $${formatUsd(order.size)} @ $${formatUsd(order.triggerPrice)}`,
          )
        } catch (err: unknown) {
          // Fill failed — drop the reservation so the next tick can retry
          // (most common cause: transient RPC hiccup, slippage beyond
          // tolerance, or a mode switch mid-flight). The order itself is
          // left in place so the user can see it and decide.
          const msg = err instanceof Error ? err.message : 'Unknown error'
          toastRef.current.error(
            'Limit fill failed',
            msg.length > 100 ? msg.slice(0, 100) + '…' : msg,
          )
        } finally {
          triggeringIds.current.delete(order.id)
        }
      }
    }

    // Fire immediately, then poll.
    void check()
    const id = setInterval(() => void check(), POLL_MS)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [isDemo, isConnected, address, chainId])
}

// ─── Execution helpers ────────────────────────────────────────────────────

async function fillDemoLimit(order: DemoOrder): Promise<void> {
  addDemoPosition({
    key: `${order.market}-${order.side}-${Date.now()}`,
    market: order.market,
    baseAsset: baseAssetFromSymbol(order.market),
    side: order.side,
    collateral: order.collateral ?? 0,
    leverage: order.leverage ?? 1,
    entryPrice: order.triggerPrice,
  })
}

async function fillLiveLimit(
  order: DemoOrder,
  chainId: number,
  _address: `0x${string}`,
  currentPriceRaw: bigint,
  increasePosition: ReturnType<typeof useTradeExecution>['increasePosition'],
): Promise<void> {
  let contracts: ReturnType<typeof getContracts>
  try {
    contracts = getContracts(chainId)
  } catch {
    throw new Error('Wrong network — live mode contracts not configured')
  }

  const markets = getMarkets(contracts.addresses)
  const indexToken = markets.find(m => m.symbol === order.market)?.indexToken
  if (!indexToken) {
    throw new Error(`Unknown market: ${order.market}`)
  }

  if ((order.collateral ?? 0) <= 0) {
    throw new Error('Missing collateral on limit order')
  }

  await increasePosition({
    indexToken,
    collateralUsd: order.collateral ?? 0,
    sizeUsd: order.size,
    isLong: order.side === 'long',
    currentPriceRaw,
  })
}
