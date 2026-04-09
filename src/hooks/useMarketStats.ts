/**
 * useMarketStats — 24h market statistics and funding rate.
 *
 * Demo mode: subscribes to the singleton Binance ticker stream — same
 *            connection that usePrices uses.
 * Live mode: polls /api/markets/:symbol/stats from the backend every 5s.
 *            Funding fields stay unset because the contracts don't expose
 *            a funding accumulator yet (Phase 2 of the contract roadmap).
 */

import { useMemo, useEffect, useState } from 'react'
import { usePrices } from './usePrices'
import { useTradingStore } from '../store/tradingStore'
import { useIsDemo } from '../store/modeStore'
import { binanceTicker, type TickerData } from '../lib/binanceTicker'
import { apiClient, type MarketStatsDto } from '../lib/apiClient'

const LIVE_REFRESH_MS = 5_000

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
  /**
   * True only when the funding fields above are backed by real data.
   * False in live mode until the contracts expose a funding accumulator
   * (planned for Phase 2 of the contract roadmap). Consumers should render
   * "—" when this is false instead of showing the placeholder zeros below.
   */
  fundingAvailable: boolean
  /**
   * True only when 24h stats (high/low/volume/change/openInterest) are
   * backed by real data. Live mode sets this true once the backend has
   * returned at least one stats response.
   */
  statsAvailable: boolean
  /**
   * True while the live stats hook is waiting for its first response.
   * Flips to false once the first fetch resolves (success OR failure) so
   * the UI can distinguish "loading skeleton" from "permanently blank".
   * Always false in demo mode.
   */
  isInitialLoad: boolean
}

export function useMarketStats(): MarketStats {
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const { getPrice } = usePrices()
  const isDemo = useIsDemo()
  const currentPrice = getPrice(selectedMarket.symbol)

  // Demo path — Binance ticker stream
  const [ticker, setTicker] = useState<TickerData | null>(null)

  // Live path — backend REST poll
  const [liveStats, setLiveStats] = useState<MarketStatsDto | null>(null)
  const [liveFirstResponseSettled, setLiveFirstResponseSettled] = useState(false)

  // Funding countdown (8h cycle, UTC-aligned). Used in demo mode only;
  // live mode keeps it for the type signature but reports unavailable.
  const [nextFundingSec, setNextFundingSec] = useState(() => calcNextFunding())
  useEffect(() => {
    const timer = setInterval(() => {
      setNextFundingSec(prev => (prev <= 0 ? 28800 : prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Subscribe to the shared Binance ticker stream in demo mode
  useEffect(() => {
    if (!isDemo) {
      setTicker(null)
      return
    }
    const unsub = binanceTicker.subscribe((tickers) => {
      const t = Array.from(tickers.values()).find(t => t.market === selectedMarket.symbol)
      if (t) setTicker(t)
    })
    return unsub
  }, [isDemo, selectedMarket.symbol])

  // Poll the backend in live mode
  useEffect(() => {
    if (isDemo) {
      setLiveStats(null)
      setLiveFirstResponseSettled(false)
      return
    }

    // Reset settled flag when the market changes so the header shows a
    // fresh skeleton while the new symbol loads.
    setLiveFirstResponseSettled(false)

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const fetchStats = async () => {
      const res = await apiClient.getMarketStats(selectedMarket.symbol)
      if (cancelled) return
      if (res.success) {
        setLiveStats(res.data)
      }
      // On failure, keep the previous snapshot — better than blanking the UI.
      setLiveFirstResponseSettled(true)
      if (!cancelled) {
        timer = setTimeout(fetchStats, LIVE_REFRESH_MS)
      }
    }

    fetchStats()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [isDemo, selectedMarket.symbol])

  return useMemo(() => {
    const price = currentPrice?.price ?? 0

    if (isDemo) {
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

      // Demo fallback while waiting for the first ticker frame
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
    }

    // Live mode — backend stats. Funding still unavailable (no contract data).
    if (liveStats) {
      return {
        price: liveStats.price > 0 ? liveStats.price : price,
        change24h: liveStats.change24h,
        change24hUsd: liveStats.change24hUsd,
        high24h: liveStats.high24h,
        low24h: liveStats.low24h,
        volume24h: liveStats.volume24h,
        // Open interest still requires a long/short snapshot table on the
        // server. Until that exists, leave it blank.
        openInterest: 0,
        fundingRate: 0,
        nextFundingSec: 0,
        fundingAvailable: false,
        statsAvailable: true,
        isInitialLoad: false,
      }
    }

    // Live mode, backend hasn't responded yet.
    // isInitialLoad stays true until the first fetch settles (success or
    // failure), after which consumers should show "—" instead of a skeleton.
    return {
      price,
      change24h: 0,
      change24hUsd: 0,
      high24h: 0,
      low24h: 0,
      volume24h: 0,
      openInterest: 0,
      fundingRate: 0,
      nextFundingSec: 0,
      fundingAvailable: false,
      statsAvailable: false,
      isInitialLoad: !liveFirstResponseSettled,
    }
  }, [currentPrice, ticker, liveStats, liveFirstResponseSettled, isDemo, nextFundingSec])
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

function estimateOI(volume24h: number): number {
  return volume24h * 0.55
}

function estimateFunding(change24h: number): number {
  return change24h > 0 ? 0.003 + Math.random() * 0.002 : -0.001 - Math.random() * 0.002
}
