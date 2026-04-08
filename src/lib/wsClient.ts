/**
 * WebSocket client for the @perp-dex/server backend.
 *
 * Singleton manager (one socket per browser tab) modelled on binanceTicker.ts.
 * Lazy-connect on first subscriber, disconnect on last unsub, exponential
 * backoff reconnect, batch dispatch via the microtask queue (no rAF needed
 * — server messages are infrequent compared to Binance ticker fan-out).
 *
 * Two channels:
 *   - 'prices' — pushed every ~3s while subscribers exist
 *   - 'events' — pushed when the indexer sees a new fill (with optional
 *                address filter)
 *
 * URL comes from VITE_WS_URL (defaults to ws://localhost:3002 for dev).
 */

const WS_URL = (import.meta.env.VITE_WS_URL ?? 'ws://localhost:3002').replace(/\/+$/, '')

// ─── Server message shapes ─────────────────────────────────────────────────

export interface ServerPriceMessage {
  type: 'price'
  token: string
  tokenAddress: string
  price: number
  priceRaw: string
  timestamp: number
}

export interface ServerTradeMessage {
  type: 'trade'
  eventType: 'increase' | 'decrease' | 'liquidate'
  account: string
  token: string
  isLong: boolean
  sizeDelta: number
  price: number
  timestamp: number
  txHash: string
}

type PriceListener = (msg: ServerPriceMessage) => void
type TradeListener = (msg: ServerTradeMessage) => void

interface TradeSubscription {
  listener: TradeListener
  /** Lowercase address filter, or '*' for all */
  filter: string
}

class PerpDexWsClient {
  private ws: WebSocket | null = null
  private connecting = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private priceListeners = new Set<PriceListener>()
  private tradeSubs = new Set<TradeSubscription>()

  /** Subscribe to live oracle price updates. Returns unsubscribe function. */
  subscribeToPrices(listener: PriceListener): () => void {
    this.priceListeners.add(listener)
    this.ensureConnected()
    this.sendIfOpen({ type: 'subscribe', channel: 'prices' })

    return () => {
      this.priceListeners.delete(listener)
      this.maybeDisconnect()
    }
  }

  /**
   * Subscribe to live fill events.
   * @param filter — lowercase 0x address to filter by, or undefined / '*' for all.
   */
  subscribeToTrades(listener: TradeListener, filter?: string): () => void {
    const normalised = filter && filter !== '*' ? filter.toLowerCase() : '*'
    const sub: TradeSubscription = { listener, filter: normalised }
    this.tradeSubs.add(sub)
    this.ensureConnected()
    this.sendIfOpen({ type: 'subscribe', channel: 'events', address: normalised })

    return () => {
      this.tradeSubs.delete(sub)
      this.maybeDisconnect()
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private ensureConnected(): void {
    if (this.ws || this.connecting) return
    this.connect()
  }

  private maybeDisconnect(): void {
    if (this.priceListeners.size === 0 && this.tradeSubs.size === 0) {
      this.disconnect()
    }
  }

  private connect(): void {
    if (this.ws || this.connecting) return
    this.connecting = true

    let socket: WebSocket
    try {
      socket = new WebSocket(WS_URL)
    } catch {
      this.connecting = false
      this.scheduleReconnect()
      return
    }
    this.ws = socket

    socket.onopen = () => {
      this.connecting = false
      this.reconnectAttempts = 0

      // Re-subscribe everything we had before the reconnect
      if (this.priceListeners.size > 0) {
        socket.send(JSON.stringify({ type: 'subscribe', channel: 'prices' }))
      }
      // The server's events channel deduplicates by socket+filter, so it's
      // safe to send one subscribe per active filter.
      const filtersSent = new Set<string>()
      for (const sub of this.tradeSubs) {
        if (filtersSent.has(sub.filter)) continue
        filtersSent.add(sub.filter)
        socket.send(JSON.stringify({ type: 'subscribe', channel: 'events', address: sub.filter }))
      }
    }

    socket.onmessage = (event: MessageEvent<string>) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data)
      } catch {
        return
      }
      if (!parsed || typeof parsed !== 'object') return
      const msg = parsed as { type?: string }

      if (msg.type === 'price') {
        const priceMsg = parsed as ServerPriceMessage
        for (const listener of this.priceListeners) {
          try { listener(priceMsg) } catch { /* ignore listener errors */ }
        }
        return
      }

      if (msg.type === 'trade') {
        const tradeMsg = parsed as ServerTradeMessage
        const account = tradeMsg.account.toLowerCase()
        for (const sub of this.tradeSubs) {
          if (sub.filter !== '*' && sub.filter !== account) continue
          try { sub.listener(tradeMsg) } catch { /* ignore */ }
        }
        return
      }
    }

    socket.onerror = () => {
      // onclose will fire next; recovery handled there.
    }

    socket.onclose = () => {
      this.ws = null
      this.connecting = false
      // Only reconnect if we still have at least one consumer.
      if (this.priceListeners.size + this.tradeSubs.size > 0) {
        this.scheduleReconnect()
      }
    }
  }

  private sendIfOpen(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
    // If the socket isn't open yet, the onopen handler will replay all
    // active subscriptions, so missed sends are recovered automatically.
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectAttempts++
    // 1s → 2s → 4s → 8s → 16s → cap at 30s.
    const delay = Math.min(30_000, 1000 * Math.pow(2, this.reconnectAttempts - 1))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null // suppress reconnect
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this.connecting = false
    this.reconnectAttempts = 0
  }
}

// Singleton — one socket per tab regardless of how many hooks subscribe.
export const wsClient = new PerpDexWsClient()
