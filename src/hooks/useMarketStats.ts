/**
 * useMarketStats — 24h market statistics and funding rate.
 *
 * Generates realistic demo data that updates with price changes.
 * In production, this would come from a backend API or indexer.
 */

import { useMemo, useRef, useEffect, useState } from 'react'
import { usePrices } from './usePrices'
import { useTradingStore } from '../store/tradingStore'

export interface MarketStats {
  price: number
  change24h: number      // percentage
  change24hUsd: number   // absolute
  high24h: number
  low24h: number
  volume24h: number
  openInterest: number
  fundingRate: number    // percentage per 8h (e.g., 0.0045 = 0.0045%)
  nextFundingSec: number // seconds until next funding
}

// Seed realistic base stats per market
const BASE_STATS: Record<string, Omit<MarketStats, 'price' | 'nextFundingSec'>> = {
  'ETH-PERP': {
    change24h: 1.23,
    change24hUsd: 42.5,
    high24h: 3580,
    low24h: 3410,
    volume24h: 284_500_000,
    openInterest: 156_000_000,
    fundingRate: 0.0042,
  },
  'BTC-PERP': {
    change24h: 0.87,
    change24hUsd: 595,
    high24h: 69200,
    low24h: 67400,
    volume24h: 1_240_000_000,
    openInterest: 892_000_000,
    fundingRate: 0.0031,
  },
}

export function useMarketStats(): MarketStats {
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const { getPrice } = usePrices()
  const currentPrice = getPrice(selectedMarket.symbol)

  // Funding countdown (8h cycle, reset every 0:00, 8:00, 16:00 UTC)
  const [nextFundingSec, setNextFundingSec] = useState(() => {
    const now = new Date()
    const hours = now.getUTCHours()
    const nextFundingHour = Math.ceil(hours / 8) * 8
    const target = new Date(now)
    target.setUTCHours(nextFundingHour, 0, 0, 0)
    if (target <= now) target.setUTCHours(target.getUTCHours() + 8)
    return Math.floor((target.getTime() - now.getTime()) / 1000)
  })

  useEffect(() => {
    const timer = setInterval(() => {
      setNextFundingSec(prev => (prev <= 0 ? 28800 : prev - 1)) // 8h = 28800s
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Drift stats slightly with price to feel alive
  const driftRef = useRef({ vol: 0, oi: 0, funding: 0 })
  useEffect(() => {
    const id = setInterval(() => {
      driftRef.current = {
        vol: (Math.random() - 0.45) * 2_000_000,
        oi: (Math.random() - 0.5) * 500_000,
        funding: (Math.random() - 0.5) * 0.0002,
      }
    }, 5000)
    return () => clearInterval(id)
  }, [])

  return useMemo(() => {
    const base = BASE_STATS[selectedMarket.symbol] ?? BASE_STATS['ETH-PERP']
    const price = currentPrice?.price ?? 0

    // Adjust high/low relative to current price
    const spread = base.high24h - base.low24h
    const mid = price || (base.high24h + base.low24h) / 2
    const high24h = mid + spread * 0.55
    const low24h = mid - spread * 0.45

    // Compute real change if we have a price
    const prevClose = price > 0 ? price / (1 + base.change24h / 100) : 0
    const change24hUsd = price > 0 ? price - prevClose : base.change24hUsd
    const change24h = price > 0 ? base.change24h + (Math.random() - 0.5) * 0.02 : base.change24h

    return {
      price,
      change24h,
      change24hUsd,
      high24h,
      low24h,
      volume24h: base.volume24h + driftRef.current.vol,
      openInterest: base.openInterest + driftRef.current.oi,
      fundingRate: base.fundingRate + driftRef.current.funding,
      nextFundingSec,
    }
  }, [selectedMarket.symbol, currentPrice, nextFundingSec])
}
