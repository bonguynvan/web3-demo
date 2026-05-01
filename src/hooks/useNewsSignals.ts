/**
 * useNewsSignals — turn CryptoPanic headlines into trading signals.
 *
 * Gated on VITE_CRYPTOPANIC_TOKEN (free tier signup at cryptopanic.com).
 * When unset, the hook is a silent no-op — no synthetic noise, no
 * console errors, signals just don't include news.
 *
 * Polls every 60s. Considers a post a signal candidate if it's voted
 * "important" by the community AND has a clear sentiment lean
 * (positive > negative or vice versa). Direction: positive → long,
 * negative → short. Confidence: blend of vote count + importance.
 */

import { useEffect, useState } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { useActiveVenue } from './useActiveVenue'
import type { Signal } from '../signals/types'

const POLL_MS = 60_000
const TTL_MS = 30 * 60_000

interface CryptoPanicPost {
  id: number
  title: string
  published_at: string
  url?: string
  votes?: {
    positive?: number
    negative?: number
    important?: number
  }
  currencies?: Array<{ code: string }>
}

interface CryptoPanicResponse {
  results: CryptoPanicPost[]
}

export function useNewsSignals(): Signal[] {
  const venueId = useActiveVenue()
  const markets = useTradingStore(s => s.markets)
  const [signals, setSignals] = useState<Signal[]>([])

  useEffect(() => {
    const token = import.meta.env.VITE_CRYPTOPANIC_TOKEN
    if (!token) return

    let cancelled = false

    const fetchOnce = async () => {
      try {
        const res = await fetch(
          `https://cryptopanic.com/api/v1/posts/?auth_token=${encodeURIComponent(token)}&public=true&filter=hot&kind=news`,
        )
        if (!res.ok) return
        const data = await res.json() as CryptoPanicResponse
        if (cancelled || !Array.isArray(data.results)) return

        const next: Signal[] = []
        const now = Date.now()
        const baseSymbols = new Set(markets.map(m => m.baseAsset.toUpperCase()))

        for (const post of data.results) {
          const positive = post.votes?.positive ?? 0
          const negative = post.votes?.negative ?? 0
          const important = post.votes?.important ?? 0
          const total = positive + negative

          if (important < 1 && total < 3) continue   // ignore quiet posts
          if (total === 0) continue
          const lean = (positive - negative) / total
          if (Math.abs(lean) < 0.5) continue         // need a clear lean

          // Match the post's currencies against active venue markets
          const codes = (post.currencies ?? []).map(c => c.code.toUpperCase())
          const hits = codes.filter(c => baseSymbols.has(c))
          if (hits.length === 0) continue

          const direction = lean > 0 ? 'long' : 'short'
          const confidence = Math.min(
            1,
            Math.min(1, important / 5) * 0.5 +
            Math.min(1, total / 50) * 0.5,
          )

          for (const code of hits) {
            const market = markets.find(m => m.baseAsset.toUpperCase() === code)
            if (!market) continue
            const publishedAt = new Date(post.published_at).getTime()
            if (now - publishedAt > TTL_MS) continue
            next.push({
              id: `news:${post.id}:${market.symbol}`,
              source: 'news',
              venue: venueId,
              marketId: market.symbol,
              direction,
              confidence,
              triggeredAt: publishedAt,
              expiresAt: publishedAt + TTL_MS,
              title: post.title.slice(0, 80),
              detail: `${direction === 'long' ? 'Bullish' : 'Bearish'} headline · ${positive}↑ ${negative}↓ ${important}★`,
            })
          }
        }
        setSignals(next)
      } catch {
        // Network / CORS failure — skip silently
      }
    }

    void fetchOnce()
    const id = setInterval(fetchOnce, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [venueId, markets])

  return signals
}
