/**
 * usePositions — open positions.
 *
 * Demo: returns demo positions from demoData store.
 * Live: reads PositionManager contract for all token × direction combos.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useChainId, useReadContracts } from 'wagmi'
import { type Address } from 'viem'
import { getContracts, getMarkets } from '../lib/contracts'
import { internalToDollars, formatLeverage } from '../lib/precision'
import { usePrices } from './usePrices'
import { useIsDemo } from '../store/modeStore'
import { getDemoPositions, type DemoPosition } from '../lib/demoData'

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

  if (isDemo) {
    return useDemoPositions(prices)
  }
  return useLivePositions(prices)
}

// ─── Demo ───

function useDemoPositions(prices: { market: string; raw: bigint; price: number }[]) {
  const [positions, setPositions] = useState<OnChainPosition[]>([])

  useEffect(() => {
    const id = setInterval(() => {
      const demoPrices = prices.map(p => ({ symbol: '', market: p.market, price: p.price, raw: p.raw }))
      const demoPos = getDemoPositions(demoPrices)
      setPositions(demoPos.map(demoToOnChain))
    }, 1000)
    return () => clearInterval(id)
  }, [prices])

  return { positions, isLoading: false }
}

function demoToOnChain(d: DemoPosition): OnChainPosition {
  return {
    key: d.key,
    market: d.market,
    baseAsset: d.baseAsset,
    indexToken: d.indexToken,
    side: d.side,
    size: d.size,
    sizeRaw: d.sizeRaw,
    collateral: d.collateral,
    collateralRaw: d.collateralRaw,
    entryPrice: d.entryPrice,
    entryPriceRaw: d.entryPriceRaw,
    markPrice: d.markPrice,
    leverage: d.leverage,
    pnl: d.pnl,
    pnlPercent: d.pnlPercent,
    liquidationPrice: d.liquidationPrice,
  }
}

// ─── Live ───

function useLivePositions(prices: { market: string; raw: bigint; price: number }[]) {
  const { address } = useAccount()
  const chainId = useChainId()

  let contracts: ReturnType<typeof getContracts> | null = null
  let slots: { market: string; baseAsset: string; indexToken: Address; isLong: boolean }[] = []
  try {
    contracts = getContracts(chainId)
    const markets = getMarkets(contracts.addresses)
    slots = markets.flatMap(m => [
      { market: m.symbol, baseAsset: m.baseAsset, indexToken: m.indexToken, isLong: true },
      { market: m.symbol, baseAsset: m.baseAsset, indexToken: m.indexToken, isLong: false },
    ])
  } catch {}

  const { data, ...query } = useReadContracts({
    contracts: slots.map(slot => ({
      ...contracts!.positionManager,
      functionName: 'getPosition' as const,
      args: [address!, slot.indexToken, slot.isLong] as const,
    })),
    query: {
      enabled: !!address && !!contracts && slots.length > 0,
      refetchInterval: 5_000,
    },
  })

  const positions: OnChainPosition[] = []

  if (data) {
    for (let i = 0; i < slots.length; i++) {
      const result = data[i]
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
      const pnlPercent = collateral > 0 ? (pnl / collateral) * 100 : 0
      const entryPrice = internalToDollars(avgPriceRaw)
      const leverageBps = collateralRaw > 0n ? (sizeRaw * 10_000n) / collateralRaw : 0n
      const leverageNum = Number(leverageBps) / 10_000
      const marginPerUnit = leverageNum > 0 ? entryPrice / leverageNum : 0
      const liqPrice = slot.isLong
        ? entryPrice - marginPerUnit * 0.95
        : entryPrice + marginPerUnit * 0.95

      positions.push({
        key: `${slot.indexToken}-${side}`,
        market: slot.market,
        baseAsset: slot.baseAsset,
        indexToken: slot.indexToken,
        side,
        size: internalToDollars(sizeRaw),
        sizeRaw,
        collateral,
        collateralRaw,
        entryPrice,
        entryPriceRaw: avgPriceRaw,
        markPrice: tokenPrice?.price ?? entryPrice,
        leverage: formatLeverage(sizeRaw, collateralRaw),
        pnl,
        pnlPercent,
        liquidationPrice: Math.max(0, liqPrice),
      })
    }
  }

  return { positions, ...query }
}
