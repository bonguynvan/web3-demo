/**
 * usePositions — open positions.
 *
 * Both demo and live paths always execute (Rules of Hooks).
 * Returns data from the active mode only.
 */

import { useState, useEffect, useRef } from 'react'
import { useAccount, useChainId, useReadContracts } from 'wagmi'
import { type Address } from 'viem'
import { getContracts, getMarkets } from '../lib/contracts'
import { internalToDollars, formatLeverage } from '../lib/precision'
import { usePrices } from './usePrices'
import { useIsDemo } from '../store/modeStore'
import { getDemoPositions, getDemoPrices, getDemoVersion } from '../lib/demoData'

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
  const [demoVersion, setDemoVersion] = useState(0)

  // Stable ref for Binance prices so the interval always reads the latest
  // without restarting on every tick. Previously this hook called
  // getDemoPrices() (the synthetic random-walk generator) instead of the
  // real Binance prices — which made PnL diverge from what the chart shows.
  const pricesRef = useRef(prices)
  pricesRef.current = prices

  useEffect(() => {
    if (!isDemo) return
    const id = setInterval(() => {
      const v = getDemoVersion()
      if (v !== demoVersion) setDemoVersion(v)
    }, 100)
    return () => clearInterval(id)
  }, [isDemo, demoVersion])

  // Map prices into the DemoPrice shape getDemoPositions expects
  const mapPrices = () => pricesRef.current.length > 0
    ? pricesRef.current.map(p => ({ symbol: p.symbol, market: p.market, price: p.price, raw: p.raw }))
    : getDemoPrices() // fallback before first Binance tick arrives

  // Re-read positions when version changes (structural: open/close)
  useEffect(() => {
    if (!isDemo) return
    const raw = getDemoPositions(mapPrices())
    setDemoPositions(raw.map(toDemoOnChain))
  }, [isDemo, demoVersion])

  // Update PnL every second from the REAL Binance prices (same source
  // the chart uses), not the synthetic demo generator.
  useEffect(() => {
    if (!isDemo) return
    const id = setInterval(() => {
      const raw = getDemoPositions(mapPrices())
      if (raw.length > 0) {
        setDemoPositions(raw.map(toDemoOnChain))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [isDemo])

  // ─── Helper ───
  function toDemoOnChain(d: ReturnType<typeof getDemoPositions>[number]): OnChainPosition {
    return {
      key: d.key, market: d.market, baseAsset: d.baseAsset, indexToken: d.indexToken,
      side: d.side, size: d.size, sizeRaw: d.sizeRaw, collateral: d.collateral,
      collateralRaw: d.collateralRaw, entryPrice: d.entryPrice, entryPriceRaw: d.entryPriceRaw,
      markPrice: d.markPrice, leverage: d.leverage, pnl: d.pnl, pnlPercent: d.pnlPercent,
      liquidationPrice: d.liquidationPrice,
    }
  }

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
