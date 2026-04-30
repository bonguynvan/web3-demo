/**
 * Binance Ticker Stream — singleton WebSocket manager.
 *
 * Subscribes to !miniTicker@arr which pushes ALL symbol tickers every 1 second.
 * We filter for the symbols we need (ETHUSDT, BTCUSDT) and notify subscribers.
 *
 * Performance:
 * - ONE WebSocket connection per browser tab (not per hook)
 * - Zero REST polling (saves ~36 HTTP requests/min)
 * - Subscribers notified via direct callback, no React state cascade
 * - Component hooks throttle their own renders via refs
 * - Auto-reconnect with exponential backoff on disconnect
 *
 * Binance message format (mini ticker):
 *   {
 *     e: "24hrMiniTicker",
 *     s: "ETHUSDT",
 *     c: "3498.50",  // close
 *     o: "3450.00",  // open 24h ago
 *     h: "3520.00",  // high
 *     l: "3440.00",  // low
 *     v: "12345.67", // base asset volume
 *     q: "43210000"  // quote asset volume (USDT)
 *   }
 */

const WS_URL = 'wss://stream.binance.com:9443/ws/!miniTicker@arr'

// Symbols we care about (Binance → canonical market id). Defaults
// keep the singleton usable before the adapter has called setSymbols.
// The adapter overrides this on first refreshMarkets so the WS filter
// matches whatever pairs the dropdown surfaces.
let SYMBOL_MAP: Record<string, string> = {
  'ETHUSDT': 'ETH-PERP',
  'BTCUSDT': 'BTC-PERP',
}

export interface TickerData {
  market: string       // "ETH-PERP"
  symbol: string       // "ETH"
  price: number        // last close
  open24h: number      // open 24h ago
  high24h: number
  low24h: number
  change24h: number    // % change
  change24hUsd: number // absolute change
  volume24h: number    // quote volume (USDT)
  baseVolume24h: number
  receivedAt: number   // ms timestamp of last update
}

type Subscriber = (tickers: Map<string, TickerData>) => void

// Grace window before we actually close an idle socket.
//
// Two problems this window solves:
//
//   1. React 18 StrictMode double-mounts every effect during dev (mount →
//      unmount → mount in quick succession). Without a grace window the
//      singleton would start a WebSocket on the first mount, close it during
//      the cleanup — while the socket is still in CONNECTING state, which
//      the browser warns about ("WebSocket is closed before the connection
//      is established") — then immediately reopen on the second mount.
//
//   2. Mode switches (demo ↔ live) briefly drop subscriber count to 0.
//      Demo mode uses binanceTicker via usePrices/useMarketStats/useTradeFeed,
//      live mode uses the backend oracle instead. Toggling modes would
//      churn the socket on every switch, and pings from Binance arriving
//      in the close window would log "Ping received after close".
//
// 30 seconds is well above StrictMode's ~20ms re-mount and comfortably above
// mode-switch latency. Only a genuine page navigation or true inactivity
// closes the socket. Binance's public stream is free and rate-unmetered, so
// the cost of keeping the socket warm is zero.
const DISCONNECT_GRACE_MS = 30_000

class BinanceTickerStream {
  private ws: WebSocket | null = null
  private tickers = new Map<string, TickerData>()
  private subscribers = new Set<Subscriber>()
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connecting = false

  // Pending deferred disconnect. Set when subscribers drop to 0; cleared
  // when a new subscriber arrives inside the grace window.
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null

  // Notification batching: collect updates, flush once per frame
  private dirty = false
  private rafId = 0

  /**
   * Replace the Binance-symbol → canonical-market-id map. Called by
   * BinanceAdapter after it loads /api/v3/exchangeInfo so the WS
   * filter matches whatever pairs the UI surfaces. Existing cached
   * tickers for symbols dropped from the map are evicted.
   */
  setSymbols(map: Record<string, string>): void {
    SYMBOL_MAP = map
    // Drop cached entries for symbols no longer in the map.
    for (const sym of Array.from(this.tickers.keys())) {
      if (!(sym in map)) this.tickers.delete(sym)
    }
  }

  /** Subscribe to ticker updates. Returns unsubscribe function. */
  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb)

    // Cancel any pending disconnect — a re-mount within the grace window
    // means we should keep the existing socket alive instead of churning it.
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer)
      this.disconnectTimer = null
    }

    // Lazy connect on first subscriber (unless we already have a live socket
    // from a previous session the grace window just rescued).
    if (this.subscribers.size === 1 && !this.ws && !this.connecting) {
      this.connect()
    }

    // Send current cache immediately
    if (this.tickers.size > 0) {
      cb(this.tickers)
    }

    return () => {
      this.subscribers.delete(cb)
      // Defer the disconnect — see DISCONNECT_GRACE_MS comment above.
      if (this.subscribers.size === 0 && !this.disconnectTimer) {
        this.disconnectTimer = setTimeout(() => {
          this.disconnectTimer = null
          if (this.subscribers.size === 0) {
            this.disconnect()
          }
        }, DISCONNECT_GRACE_MS)
      }
    }
  }

  /** Get latest ticker for a market (synchronous, may be undefined) */
  get(market: string): TickerData | undefined {
    for (const t of this.tickers.values()) {
      if (t.market === market) return t
    }
    return undefined
  }

  /** Get all current tickers */
  getAll(): Map<string, TickerData> {
    return this.tickers
  }

  // ─── Internal ───

  private connect() {
    if (this.ws || this.connecting) return
    this.connecting = true

    try {
      this.ws = new WebSocket(WS_URL)
    } catch {
      this.connecting = false
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.connecting = false
      this.reconnectAttempts = 0
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // !miniTicker@arr sends an array of all tickers
        if (Array.isArray(data)) {
          this.processBatch(data)
        }
      } catch {
        // Ignore malformed messages
      }
    }

    this.ws.onerror = () => {
      // onclose will fire next, handle reconnect there
    }

    this.ws.onclose = () => {
      this.ws = null
      this.connecting = false
      // Only reconnect if we still have subscribers
      if (this.subscribers.size > 0) {
        this.scheduleReconnect()
      }
    }
  }

  private processBatch(items: any[]) {
    let changed = false
    const now = Date.now()

    for (const item of items) {
      const binanceSymbol = item.s as string
      const market = SYMBOL_MAP[binanceSymbol]
      if (!market) continue // not a symbol we care about

      const close = parseFloat(item.c)
      const open = parseFloat(item.o)
      const change24h = open > 0 ? ((close - open) / open) * 100 : 0

      this.tickers.set(binanceSymbol, {
        market,
        symbol: market.split('-')[0],
        price: close,
        open24h: open,
        high24h: parseFloat(item.h),
        low24h: parseFloat(item.l),
        change24h,
        change24hUsd: close - open,
        volume24h: parseFloat(item.q),
        baseVolume24h: parseFloat(item.v),
        receivedAt: now,
      })
      changed = true
    }

    if (changed) this.scheduleNotify()
  }

  /** rAF-throttled notification — coalesces multiple updates per frame */
  private scheduleNotify() {
    if (this.dirty) return
    this.dirty = true
    this.rafId = requestAnimationFrame(() => {
      this.dirty = false
      this.rafId = 0
      // Snapshot for subscribers
      for (const cb of this.subscribers) {
        try { cb(this.tickers) } catch { /* ignore subscriber errors */ }
      }
    })
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectAttempts++
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(30_000, 1000 * Math.pow(2, this.reconnectAttempts - 1))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer)
      this.disconnectTimer = null
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    if (this.ws) {
      // Detach all handlers before closing so any in-flight frame (ping,
      // delayed message) doesn't get routed into our code while the close
      // handshake is in progress.
      this.ws.onclose = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onopen = null
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this.connecting = false
  }
}

// Singleton instance
export const binanceTicker = new BinanceTickerStream()
