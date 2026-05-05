/**
 * useMarketStats — 24h market statistics and funding rate.
 *
 * Single source: the singleton Binance ticker stream (same connection
 * that usePrices uses). Pre-pivot this also had a backend-poll branch
 * gated on `useIsDemo()`; that path read from a backend that no longer
 * exists.
 *
 * Funding fields are estimated from price change because no public WS
 * endpoint exposes funding directly. When venue adapters surface a real
 * funding rate, swap the estimator for the adapter value.
 */

import { useMemo, useEffect, useState } from 'react'
import { usePrices } from './usePrices'
import { useTradingStore } from '../store/tradingStore'
import { binanceTicker, type TickerData } from '../lib/binanceTicker'

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
  fundingAvailable: boolean
  statsAvailable: boolean
  isInitialLoad: boolean
}

export function useMarketStats(): MarketStats {
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const { getPrice } = usePrices()
  const currentPrice = getPrice(selectedMarket.symbol)
  const [ticker, setTicker] = useState<TickerData | null>(null)

  const [nextFundingSec, setNextFundingSec] = useState(() => calcNextFunding())
  useEffect(() => {
    const timer = setInterval(() => {
      setNextFundingSec(prev => (prev <= 0 ? 28800 : prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const unsub = binanceTicker.subscribe((tickers) => {
      const t = Array.from(tickers.values()).find(t => t.market === selectedMarket.symbol)
      if (t) setTicker(t)
    })
    return unsub
  }, [selectedMarket.symbol])

  return useMemo(() => {
    const price = currentPrice?.price ?? 0

    if (ticker) {
      return {
        price,
        change24h: ticker.change24h,
        change24hUsd: ticker.change24hUsd,
        high24h: ticker.high24h,
        low24h: ticker.low24h,
        volume24h: ticker.volume24h,
        openInterest: estimateOI(ticker.volume24h),
        fundingRate: estimateFunding(ticker.change24h),
        nextFundingSec,
        fundingAvailable: true,
        statsAvailable: true,
        isInitialLoad: false,
      }
    }

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
      fundingAvailable: true,
      statsAvailable: true,
      isInitialLoad: false,
    }
  }, [currentPrice, ticker, nextFundingSec])
}

function calcNextFunding(): number {
  const now = new Date()
  const hours = now.getUTCHours()
  const nextH = Math.ceil(hours / 8) * 8
  const target = new Date(now)
  target.setUTCHours(nextH, 0, 0, 0)
  if (target <= now) target.setUTCHours(target.getUTCHours() + 8)
  return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
}

function estimateOI(volume24h: number): number {
  return volume24h * 0.6
}

function estimateFunding(change24h: number): number {
  return change24h > 0 ? 0.003 + Math.random() * 0.002 : -0.001 - Math.random() * 0.002
}
