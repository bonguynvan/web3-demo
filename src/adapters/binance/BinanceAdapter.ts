/**
 * BinanceAdapter — read-only public-data implementation.
 *
 * Phase-1 scope: ticker stream, klines (REST + WS), market metadata.
 * Trading methods are stubbed and throw — wire them up in phase 2 once
 * we have an encrypted server-side key proxy.
 *
 * Reuses src/lib/binanceTicker.ts for the ticker socket so we don't run
 * two parallel connections during the migration.
 */

import { binanceTicker, type TickerData } from '../../lib/binanceTicker'
import type { VenueAdapter } from '../VenueAdapter'
import type {
  Balance,
  Candle,
  Fill,
  Market,
  Order,
  OrderBook,
  PlaceOrderIntent,
  Position,
  PublicTrade,
  Ticker,
  TimeFrame,
  Unsubscribe,
  VenueCapabilities,
  VenueCredentials,
  VenueError,
  VenueId,
} from '../types'

const REST_BASE = 'https://api.binance.com'
const WS_BASE = 'wss://stream.binance.com:9443/ws'

const TF_TO_BINANCE: Record<TimeFrame, string> = {
  '1m':  '1m',  '3m':  '3m',  '5m':  '5m',  '15m': '15m', '30m': '30m',
  '1h':  '1h',  '2h':  '2h',  '4h':  '4h',  '6h':  '6h',  '12h': '12h',
  '1d':  '1d',  '1w':  '1w',
}

/** Phase-1 markets — mirror SYMBOL_MAP in src/lib/binanceTicker.ts. */
const MARKETS: Market[] = [
  mkMarket('ETH-PERP', 'ETH', 'USDT', 'ETHUSDT'),
  mkMarket('BTC-PERP', 'BTC', 'USDT', 'BTCUSDT'),
  mkMarket('SOL-PERP', 'SOL', 'USDT', 'SOLUSDT'),
  mkMarket('ARB-PERP', 'ARB', 'USDT', 'ARBUSDT'),
  mkMarket('DOGE-PERP', 'DOGE', 'USDT', 'DOGEUSDT'),
  mkMarket('LINK-PERP', 'LINK', 'USDT', 'LINKUSDT'),
  mkMarket('AVAX-PERP', 'AVAX', 'USDT', 'AVAXUSDT'),
]

function mkMarket(id: string, base: string, quote: string, venueSymbol: string): Market {
  return {
    id, base, quote,
    kind: 'perp',
    venueSymbol,
    tickSize: 0.01,
    stepSize: 0.001,
  }
}

function tickerFromBinance(t: TickerData): Ticker {
  return {
    marketId: t.market,
    price: t.price,
    open24h: t.open24h,
    high24h: t.high24h,
    low24h: t.low24h,
    change24hPct: t.change24h,
    volume24hQuote: t.volume24h,
    receivedAt: t.receivedAt,
  }
}

function notImplemented(method: string): VenueError {
  const e = new Error(`BinanceAdapter.${method} not implemented in phase 1`) as VenueError
  e.venue = 'binance'
  e.retryable = false
  e.isReject = true
  return e
}

export class BinanceAdapter implements VenueAdapter {
  readonly id: VenueId = 'binance'
  readonly displayName = 'Binance'

  readonly capabilities: VenueCapabilities = {
    spot: true,
    perp: true,
    trading: false,                  // flips true after authenticate()
    websocketTickers: true,
    websocketOrderBook: true,
    websocketTrades: true,
    websocketFills: false,           // requires user-data-stream listenKey
    conditionalOrders: true,
    reduceOnly: true,
    postOnly: true,
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  async connect(): Promise<void> {
    // binanceTicker is lazy — connects on first subscriber. No-op here.
  }

  async disconnect(): Promise<void> {
    // Singleton manages its own lifecycle by subscriber count.
  }

  async authenticate(_creds: VenueCredentials): Promise<void> {
    throw notImplemented('authenticate')
  }

  // ─── Market metadata ────────────────────────────────────────────────

  async listMarkets(): Promise<Market[]> {
    return MARKETS
  }

  getMarket(marketId: string): Market | undefined {
    return MARKETS.find(m => m.id === marketId)
  }

  // ─── Tickers ────────────────────────────────────────────────────────

  getTicker(marketId: string): Ticker | undefined {
    const raw = binanceTicker.get(marketId)
    return raw ? tickerFromBinance(raw) : undefined
  }

  subscribeTicker(marketId: string, cb: (t: Ticker) => void): Unsubscribe {
    return binanceTicker.subscribe((tickers) => {
      for (const t of tickers.values()) {
        if (t.market === marketId) {
          cb(tickerFromBinance(t))
          return
        }
      }
    })
  }

  // ─── Klines (REST + WS) ─────────────────────────────────────────────

  async getKlines(
    marketId: string,
    timeframe: TimeFrame,
    opts: { limit?: number; endTime?: number } = {},
  ): Promise<Candle[]> {
    const market = this.getMarket(marketId)
    if (!market) throw this.toError(`unknown market ${marketId}`, false, true)

    const params = new URLSearchParams({
      symbol: market.venueSymbol,
      interval: TF_TO_BINANCE[timeframe],
      limit: String(opts.limit ?? 500),
    })
    if (opts.endTime) params.set('endTime', String(opts.endTime))

    const res = await fetch(`${REST_BASE}/api/v3/klines?${params}`)
    if (!res.ok) {
      throw this.toError(`klines ${res.status}`, res.status >= 500, res.status < 500)
    }

    // Binance kline tuple: [openTime, o, h, l, c, v, closeTime, quoteVol, trades, ...]
    const rows = (await res.json()) as unknown[]
    if (!Array.isArray(rows)) {
      throw this.toError('klines: malformed response', true, false)
    }

    return rows.map((row): Candle => {
      const r = row as [number, string, string, string, string, string, ...unknown[]]
      return {
        time: r[0],
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
        volume: parseFloat(r[5]),
      }
    })
  }

  subscribeKlines(
    marketId: string,
    timeframe: TimeFrame,
    cb: (c: Candle) => void,
  ): Unsubscribe {
    const market = this.getMarket(marketId)
    if (!market) return () => {}

    const stream = `${market.venueSymbol.toLowerCase()}@kline_${TF_TO_BINANCE[timeframe]}`
    const ws = new WebSocket(`${WS_BASE}/${stream}`)

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { k?: BinanceKlineMsg }
        if (!msg.k) return
        cb({
          time: msg.k.t,
          open: parseFloat(msg.k.o),
          high: parseFloat(msg.k.h),
          low: parseFloat(msg.k.l),
          close: parseFloat(msg.k.c),
          volume: parseFloat(msg.k.v),
        })
      } catch {
        // ignore malformed frames
      }
    }

    return () => {
      ws.onmessage = null
      try { ws.close() } catch { /* ignore */ }
    }
  }

  // ─── Order book / trades — phase 1 stubs ───────────────────────────

  async getOrderBook(_marketId: string, _depth?: number): Promise<OrderBook> {
    throw notImplemented('getOrderBook')
  }
  subscribeOrderBook(_marketId: string, _cb: (b: OrderBook) => void): Unsubscribe {
    return () => {}
  }
  subscribeTrades(_marketId: string, _cb: (t: PublicTrade) => void): Unsubscribe {
    return () => {}
  }

  // ─── Account / trading — phase 2 ───────────────────────────────────

  async getBalances(): Promise<Balance[]> { throw notImplemented('getBalances') }
  subscribeBalances(_cb: (b: Balance[]) => void): Unsubscribe { return () => {} }
  async getPositions(): Promise<Position[]> { throw notImplemented('getPositions') }
  subscribePositions(_cb: (p: Position[]) => void): Unsubscribe { return () => {} }
  async getOpenOrders(_marketId?: string): Promise<Order[]> { throw notImplemented('getOpenOrders') }
  subscribeOrders(_cb: (o: Order) => void): Unsubscribe { return () => {} }
  subscribeFills(_cb: (f: Fill) => void): Unsubscribe { return () => {} }
  async placeOrder(_intent: PlaceOrderIntent): Promise<Order> { throw notImplemented('placeOrder') }
  async cancelOrder(_args: { marketId: string; orderId: string }): Promise<void> {
    throw notImplemented('cancelOrder')
  }
  async cancelAllOrders(_marketId?: string): Promise<void> { throw notImplemented('cancelAllOrders') }
  async setLeverage(_args: { marketId: string; leverage: number }): Promise<void> {
    throw notImplemented('setLeverage')
  }
  async closePosition(_args: { marketId: string; fraction?: number; slippageBps?: number }): Promise<Order> {
    throw notImplemented('closePosition')
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private toError(message: string, retryable: boolean, isReject: boolean): VenueError {
    const e = new Error(`Binance: ${message}`) as VenueError
    e.venue = 'binance'
    e.retryable = retryable
    e.isReject = isReject
    return e
  }
}

interface BinanceKlineMsg {
  t: number      // open time (ms)
  o: string
  h: string
  l: string
  c: string
  v: string
}
