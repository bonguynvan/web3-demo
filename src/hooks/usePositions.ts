/**
 * usePositions — open positions.
 *
 * Both demo and live paths always execute (Rules of Hooks).
 * Returns data from the active mode only.
 */

import { useState, useEffect } from 'react'
import { useAccount, useChainId, useReadContracts } from 'wagmi'
import { type Address } from 'viem'
import { getContracts, getMarkets } from '../lib/contracts'
import { internalToDollars, formatLeverage } from '../lib/precision'
import { usePrices } from './usePrices'
import { useIsDemo } from '../store/modeStore'
import { getDemoPositions } from '../lib/demoData'

export interface OnChainPosition {
  key: string
  market: string
  baseAsset: string
  indexToken: Address
  side: 'long' | 'short'
  size: number
  sizeRaw: bigint
  collateral: number
  collateralRaw: bigint
  entryPrice: number
  entryPriceRaw: bigint
  markPrice: number
  leverage: string
  pnl: number
  pnlPercent: number
  liquidationPrice: number
}

export function usePositions() {
  const isDemo = useIsDemo()
  const { prices } = usePrices()
  const { address } = useAccount()
  const chainId = useChainId()

  // ─── Demo path (always runs) ───
  const [demoPositions, setDemoPositions] = useState<OnChainPosition[]>([])

  useEffect(() => {
    if (!isDemo) return
    const id = setInterval(() => {
      const demoPrices = prices.map(p => ({ symbol: '', market: p.market, price: p.price, raw: p.raw }))
      const raw = getDemoPositions(demoPrices)
      setDemoPositions(raw.map(d => ({
        key: d.key, market: d.market, baseAsset: d.baseAsset, indexToken: d.indexToken,
        side: d.side, size: d.size, sizeRaw: d.sizeRaw, collateral: d.collateral,
        collateralRaw: d.collateralRaw, entryPrice: d.entryPrice, entryPriceRaw: d.entryPriceRaw,
        markPrice: d.markPrice, leverage: d.leverage, pnl: d.pnl, pnlPercent: d.pnlPercent,
        liquidationPrice: d.liquidationPrice,
      })))
    }, 1000)
    return () => clearInterval(id)
  }, [isDemo, prices])

  // ─── Live path (always runs, disabled when demo) ───
  let contracts: ReturnType<typeof getContracts> | null = null
  let slots: { market: string; baseAsset: string; indexToken: Address; isLong: boolean }[] = []
  try {
    contracts = getContracts(chainId)
    const mkts = getMarkets(contracts.addresses)
    slots = mkts.flatMap(m => [
      { market: m.symbol, baseAsset: m.baseAsset, indexToken: m.indexToken, isLong: true },
      { market: m.symbol, baseAsset: m.baseAsset, indexToken: m.indexToken, isLong: false },
    ])
  } catch {}

  const { data: liveData } = useReadContracts({
    contracts: contracts ? slots.map(slot => ({
      ...contracts!.positionManager,
      functionName: 'getPosition' as const,
      args: [address!, slot.indexToken, slot.isLong] as const,
    })) : [],
    query: {
      enabled: !isDemo && !!address && !!contracts && slots.length > 0,
      refetchInterval: 5_000,
    },
  })

  // Build live positions
  const livePositions: OnChainPosition[] = []
  if (liveData && !isDemo) {
    for (let i = 0; i < slots.length; i++) {
      const result = liveData[i]
      if (result?.status !== 'success') continue
      const raw = result.result as readonly [bigint, bigint, bigint, bigint, bigint]
      const [sizeRaw, collateralRaw, avgPriceRaw] = raw
      if (sizeRaw === 0n) continue

      const slot = slots[i]
      const side = slot.isLong ? 'long' : 'short' as const
      const tokenPrice = prices.find(p => p.market === slot.market)
      const markPriceRaw = tokenPrice?.raw ?? avgPriceRaw

      const hasProfit = slot.isLong ? markPriceRaw > avgPriceRaw : avgPriceRaw > markPriceRaw
      const priceDelta = hasProfit
        ? (slot.isLong ? markPriceRaw - avgPriceRaw : avgPriceRaw - markPriceRaw)
        : (slot.isLong ? avgPriceRaw - markPriceRaw : markPriceRaw - avgPriceRaw)
      const deltaRaw = avgPriceRaw > 0n ? (sizeRaw * priceDelta) / avgPriceRaw : 0n
      const pnlRaw = hasProfit ? deltaRaw : -deltaRaw
      const pnl = internalToDollars(pnlRaw < 0n ? -pnlRaw : pnlRaw) * (pnlRaw < 0n ? -1 : 1)
      const collateral = internalToDollars(collateralRaw)
      const entryPrice = internalToDollars(avgPriceRaw)
      const leverageBps = collateralRaw > 0n ? (sizeRaw * 10_000n) / collateralRaw : 0n
      const leverageNum = Number(leverageBps) / 10_000
      const marginPerUnit = leverageNum > 0 ? entryPrice / leverageNum : 0

      livePositions.push({
        key: `${slot.indexToken}-${side}`,
        market: slot.market, baseAsset: slot.baseAsset, indexToken: slot.indexToken, side,
        size: internalToDollars(sizeRaw), sizeRaw, collateral, collateralRaw,
        entryPrice, entryPriceRaw: avgPriceRaw,
        markPrice: tokenPrice?.price ?? entryPrice,
        leverage: formatLeverage(sizeRaw, collateralRaw),
        pnl, pnlPercent: collateral > 0 ? (pnl / collateral) * 100 : 0,
        liquidationPrice: Math.max(0, slot.isLong
          ? entryPrice - marginPerUnit * 0.95
          : entryPrice + marginPerUnit * 0.95),
      })
    }
  }

  return { positions: isDemo ? demoPositions : livePositions, isLoading: false }
}
