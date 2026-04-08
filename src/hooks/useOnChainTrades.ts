/**
 * useOnChainTrades — live trade tape sourced from the @perp-dex/server backend.
 *
 * Strategy:
 *   1. On mount, seed the tape via REST `/api/trades?token=<index>` so the
 *      panel isn't empty before the first fill arrives.
 *   2. Then subscribe to the WebSocket `events` channel and append every
 *      new fill that matches the current market.
 *
 * Demo mode is handled by useTradeFeed; this hook is a no-op in demo.
 *
 * The previous implementation polled `getContractEvents` every 3s — that
 * worked but made one round-trip per tab. The new path is one persistent
 * socket per tab, regardless of how many hooks subscribe (wsClient is a
 * singleton).
 */

import { useEffect, useRef } from 'react'
import { useChainId } from 'wagmi'
import { useTradingStore } from '../store/tradingStore'
import { useIsDemo } from '../store/modeStore'
import { getContracts, getMarkets } from '../lib/contracts'
import { apiClient, type ServerTradeDto } from '../lib/apiClient'
import { wsClient, type ServerTradeMessage } from '../lib/wsClient'
import type { Trade } from '../types/trading'

export function useOnChainTrades() {
  const isDemo = useIsDemo()
  const chainId = useChainId()
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const addTrade = useTradingStore(s => s.addTrade)

  // Stable ref so the long-running effect doesn't restart when addTrade
  // changes identity.
  const addTradeRef = useRef(addTrade)
  addTradeRef.current = addTrade

  useEffect(() => {
    if (isDemo) return

    let contracts: ReturnType<typeof getContracts>
    let indexToken: `0x${string}` | undefined
    try {
      contracts = getContracts(chainId)
      const markets = getMarkets(contracts.addresses)
      indexToken = markets.find(m => m.symbol === selectedMarket.symbol)?.indexToken
    } catch {
      // Chain not configured for live mode (e.g. wrong network).
      return
    }
    if (!indexToken) return

    const targetToken = indexToken.toLowerCase()
    let cancelled = false
    let counter = 0
    const seenTxLogs = new Set<string>()

    // Generate stable IDs even when the server doesn't include logIndex
    // in WS messages. Backfill (REST) gives us tx-hash + a synthetic counter
    // per server payload; live (WS) gets a fresh counter so duplicates
    // between the seed and the first WS frame can't collide.
    const makeId = (prefix: string, txHash: string) => {
      const id = `${prefix}-${txHash}-${counter++}`
      return id
    }

    // ─── Seed via REST ───────────────────────────────────────────────────
    apiClient
      .getRecentTrades({ token: targetToken, limit: 50 })
      .then(res => {
        if (cancelled) return
        if (!res.success) return

        // The store keeps newest at index 0, so feed oldest first.
        const ordered = res.data.slice().sort((a, b) => a.timestamp - b.timestamp)
        for (const dto of ordered) {
          const trade = serverTradeDtoToTrade(dto, makeId('seed', dto.txHash))
          if (!trade) continue
          // Server's seed already de-duped via SQL; tag the (txHash, eventType,
          // sizeDelta) tuple so the WS subscription doesn't re-add the same
          // events that arrive immediately after subscribe.
          seenTxLogs.add(`${dto.txHash}-${dto.eventType}-${dto.sizeDelta}`)
          addTradeRef.current(trade)
        }
      })
      .catch(() => {
        // Seeding failure is non-fatal — the WebSocket will start filling
        // the tape as new trades arrive.
      })

    // ─── Subscribe to live WS feed ───────────────────────────────────────
    const unsubscribe = wsClient.subscribeToTrades((msg: ServerTradeMessage) => {
      if (cancelled) return

      // Skip messages for other markets — server's filter is per-account
      // (not per-token), so we filter by token symbol here.
      const expectedToken = selectedMarket.baseAsset
      if (msg.token !== expectedToken) return

      const dedupeKey = `${msg.txHash}-${msg.eventType}-${msg.sizeDelta}`
      if (seenTxLogs.has(dedupeKey)) return
      seenTxLogs.add(dedupeKey)

      const trade = wsTradeMessageToTrade(msg, makeId('live', msg.txHash))
      if (trade) addTradeRef.current(trade)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [isDemo, chainId, selectedMarket.symbol, selectedMarket.baseAsset])
}

// ─── Mappers ──────────────────────────────────────────────────────────────

function serverTradeDtoToTrade(dto: ServerTradeDto, id: string): Trade | null {
  if (dto.price <= 0) return null
  // sizeDelta is in USD notional; convert to coin amount for the tape display.
  const sizeCoin = dto.sizeDelta / dto.price
  return {
    id,
    price: +dto.price.toFixed(2),
    size: +sizeCoin.toFixed(6),
    side: dto.isLong ? 'long' : 'short',
    time: dto.timestamp * 1000, // server uses unix seconds
  }
}

function wsTradeMessageToTrade(msg: ServerTradeMessage, id: string): Trade | null {
  if (msg.price <= 0) return null
  const sizeCoin = msg.sizeDelta / msg.price
  return {
    id,
    price: +msg.price.toFixed(2),
    size: +sizeCoin.toFixed(6),
    side: msg.isLong ? 'long' : 'short',
    time: msg.timestamp * 1000,
  }
}
