/**
 * useOnchainWhaleSignals — surface whale-wallet open-position fills.
 *
 * Hyperliquid is fully on-chain — every user's fills are public via
 * /info type:userFills. We poll a configurable watchlist of whale
 * addresses every 60s and fire a signal when any of them opens a new
 * position above the notional threshold.
 *
 * Gated on VITE_HL_WHALE_WALLETS (comma-separated addresses). Without
 * it the hook is a silent no-op. Only fires when the active venue is
 * Hyperliquid since the data source is HL-specific.
 */

import { useEffect, useState } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { useActiveVenue } from './useActiveVenue'
import type { Signal } from '../signals/types'

const POLL_MS = 60_000
const FRESH_WINDOW_MS = 10 * 60_000     // only consider fills in last 10 min
const MIN_NOTIONAL_USD = 50_000
const SIGNAL_TTL_MS = 30 * 60_000

interface HlFill {
  coin: string
  px: string
  sz: string
  side: 'A' | 'B'
  time: number
  /** "Open Long" | "Open Short" | "Close Long" | "Close Short" | ... */
  dir: string
}

export function useOnchainWhaleSignals(): Signal[] {
  const venueId = useActiveVenue()
  const markets = useTradingStore(s => s.markets)
  const [signals, setSignals] = useState<Signal[]>([])

  useEffect(() => {
    if (venueId !== 'hyperliquid') {
      setSignals([])
      return
    }

    const raw = import.meta.env.VITE_HL_WHALE_WALLETS as string | undefined
    const wallets = (raw ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (wallets.length === 0) return

    let cancelled = false
    const baseSymbols = new Set(markets.map(m => m.baseAsset))
    const marketByBase = new Map(markets.map(m => [m.baseAsset, m] as const))

    const fetchOnce = async () => {
      const since = Date.now() - FRESH_WINDOW_MS
      try {
        const results = await Promise.all(wallets.map(async (user) => {
          try {
            const res = await fetch('https://api.hyperliquid.xyz/info', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'userFills', user }),
            })
            if (!res.ok) return [] as HlFill[]
            const fills = await res.json() as unknown
            if (!Array.isArray(fills)) return [] as HlFill[]
            return fills.filter((f): f is HlFill =>
              typeof f === 'object' && f !== null
              && typeof (f as HlFill).time === 'number'
              && (f as HlFill).time >= since)
          } catch {
            return [] as HlFill[]
          }
        }))

        if (cancelled) return

        const next: Signal[] = []
        for (let i = 0; i < wallets.length; i++) {
          const wallet = wallets[i]
          const fills = results[i]
          for (const f of fills) {
            if (!baseSymbols.has(f.coin)) continue
            const px = parseFloat(f.px)
            const sz = parseFloat(f.sz)
            const notional = px * sz
            if (!Number.isFinite(notional) || notional < MIN_NOTIONAL_USD) continue
            // Only signal on position opens — closes are noise here.
            if (!f.dir.startsWith('Open')) continue
            const direction = f.dir.includes('Long') ? 'long' : 'short'
            const market = marketByBase.get(f.coin)
            if (!market) continue
            const confidence = Math.min(1, notional / 2_000_000)
            const shortAddr = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
            next.push({
              id: `whale:onchain:${wallet}:${f.time}:${f.coin}`,
              source: 'whale',
              venue: 'hyperliquid',
              marketId: market.symbol,
              direction,
              confidence,
              triggeredAt: f.time,
              expiresAt: f.time + SIGNAL_TTL_MS,
              title: 'Whale wallet opened position',
              detail: `${shortAddr} opened ${direction} ${market.symbol} for $${(notional / 1000).toFixed(0)}k`,
              suggestedPrice: px,
            })
          }
        }
        setSignals(next)
      } catch {
        // network blip — keep last set
      }
    }

    void fetchOnce()
    const id = setInterval(fetchOnce, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [venueId, markets])

  return signals
}
