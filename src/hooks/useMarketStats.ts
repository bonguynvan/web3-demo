/**
 * useMarketStats — 24h market statistics and funding rate.
 *
 * Demo mode: fetches real 24h stats from Binance public API.
 * Falls back to generated demo data if Binance is unreachable.
 */

import { useMemo, useEffect, useState } from 'react'
import { usePrices } from './usePrices'
import { useTradingStore } from '../store/tradingStore'
import { useIsDemo } from '../store/modeStore'
import { fetchBinance24hStats, type Binance24hStats } from '../lib/binancePrices'

export interface MarketStats {
  price: number
  change24h: number
  change24hUsd: number
  high24h: number
  low24h: number
  volume24h: number
  openInterest: number
  fundingRate: number
  nextFundingSec: number
}

export function useMarketStats(): MarketStats {
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const { getPrice } = usePrices()
  const isDemo = useIsDemo()
  const currentPrice = getPrice(selectedMarket.symbol)

  const [binanceStats, setBinanceStats] = useState<Binance24hStats | null>(null)

  // Funding countdown (8h cycle)
  const [nextFundingSec, setNextFundingSec] = useState(() => calcNextFunding())

  useEffect(() => {
    const timer = setInterval(() => {
      setNextFundingSec(prev => (prev <= 0 ? 28800 : prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch real 24h stats from Binance
  useEffect(() => {
    if (!isDemo) return
    let active = true

    const poll = async () => {
      const stats = await fetchBinance24hStats()
      if (!active) return
      const match = stats.find(s => s.market === selectedMarket.symbol)
      if (match) setBinanceStats(match)
    }
    poll()
    const id = setInterval(poll, 10_000) // every 10s

    return () => { active = false; clearInterval(id) }
  }, [isDemo, selectedMarket.symbol])

  return useMemo(() => {
    const price = currentPrice?.price ?? 0

    if (binanceStats && isDemo) {
      // Real Binance 24h data
      return {
        price,
        change24h: binanceStats.change24h,
        change24hUsd: binanceStats.change24hUsd,
        high24h: binanceStats.high24h,
        low24h: binanceStats.low24h,
        volume24h: binanceStats.volume24h,
        openInterest: estimateOI(binanceStats.volume24h),
        fundingRate: estimateFunding(binanceStats.change24h),
        nextFundingSec,
      }
    }

    // Fallback: generate from price
    const baseVol = price > 10000 ? 1_200_000_000 : 280_000_000
    return {
      price,
      change24h: 0,
      change24hUsd: 0,
      high24h: price * 1.02,
      low24h: price * 0.98,
      volume24h: baseVol,
      openInterest: baseVol * 0.6,
      fundingRate: 0.0035,
      nextFundingSec,
    }
  }, [currentPrice, binanceStats, isDemo, nextFundingSec])
}

function calcNextFunding(): number {
  const now = new Date()
  const hours = now.getUTCHours()
  const nextH = Math.ceil(hours / 8) * 8
  const target = new Date(now)
  target.setUTCHours(nextH, 0, 0, 0)
  if (target <= now) target.setUTCHours(target.getUTCHours() + 8)
  return Math.floor((target.getTime() - now.getTime()) / 1000)
}

// Estimate OI from volume (no free endpoint for this)
function estimateOI(volume24h: number): number {
  return volume24h * 0.55
}

// Estimate funding from 24h change direction
function estimateFunding(change24h: number): number {
  return change24h > 0 ? 0.003 + Math.random() * 0.002 : -0.001 - Math.random() * 0.002
}
