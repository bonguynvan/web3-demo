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

/**
 * Cap the Binance dropdown at this many pairs. Sorted by 24h quote
 * volume (USDT) descending so the most actively-traded markets surface
 * first. Tune this if the dropdown feels too long or too short — the
 * underlying fetch covers all USDT pairs regardless.
 */
const MAX_PAIRS = 30

interface BinanceSymbolInfo {
  symbol: string
  status: string
  baseAsset: string
  quoteAsset: string
  filters: Array<{ filterType: string; tickSize?: string; stepSize?: string; [k: string]: unknown }>
}

interface BinanceTicker24h {
  symbol: string
  quoteVolume: string
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
    // We currently target api.binance.com (spot). Switch to fapi.binance.com
    // and flip perp=true if/when USD-M futures are wired.
    spot: true,
    perp: false,
    trading: false,                  // flips true after authenticate()
    websocketTickers: true,
    websocketOrderBook: true,
    websocketTrades: true,
    websocketFills: false,           // requires user-data-stream listenKey
    conditionalOrders: true,
    reduceOnly: true,
    postOnly: true,
  }

  // ─── Internal state ─────────────────────────────────────────────────

  private markets: Market[] = []

  // ─── Lifecycle ──────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.markets.length === 0) await this.refreshMarkets()
  }

  async disconnect(): Promise<void> {
    // Singleton manages its own lifecycle by subscriber count.
  }

  async authenticate(_creds: VenueCredentials): Promise<void> {
    throw notImplemented('authenticate')
  }

  // ─── Market metadata ────────────────────────────────────────────────

  async listMarkets(): Promise<Market[]> {
    if (this.markets.length === 0) await this.refreshMarkets()
    return this.markets
  }

  getMarket(marketId: string): Market | undefined {
    return this.markets.find(m => m.id === marketId)
  }

  private async refreshMarkets(): Promise<void> {
    // Two endpoints in parallel:
    //   exchangeInfo: market metadata (status, filters, decimals)
    //   ticker/24hr: 24h quote volume for ranking
    // ticker/24hr returns ~700 entries (~200KB) but is one-shot per
    // venue connect, so the bandwidth is fine.
    const [infoRes, tickRes] = await Promise.all([
      fetch(`${REST_BASE}/api/v3/exchangeInfo`),
      fetch(`${REST_BASE}/api/v3/ticker/24hr`),
    ])
    if (!infoRes.ok) {
      throw this.toError(`exchangeInfo ${infoRes.status}`, infoRes.status >= 500, infoRes.status < 500)
    }
    if (!tickRes.ok) {
      throw this.toError(`ticker/24hr ${tickRes.status}`, tickRes.status >= 500, tickRes.status < 500)
    }
    const info = await infoRes.json() as { symbols?: BinanceSymbolInfo[] }
    const ticks = await tickRes.json() as BinanceTicker24h[]
    if (!Array.isArray(info.symbols) || !Array.isArray(ticks)) {
      throw this.toError('refreshMarkets: malformed response', true, false)
    }

    const volumeBySymbol = new Map<string, number>()
    for (const t of ticks) {
      const v = parseFloat(t.quoteVolume)
      if (Number.isFinite(v)) volumeBySymbol.set(t.symbol, v)
    }

    // Pair each TRADING USDT symbol with its 24h quote volume.
    type Ranked = { market: Market; volume: number }
    const ranked: Ranked[] = []
    for (const s of info.symbols) {
      if (s.status !== 'TRADING') continue
      if (s.quoteAsset !== 'USDT') continue

      const tickSize = parseFloat(
        s.filters.find(f => f.filterType === 'PRICE_FILTER')?.tickSize ?? '0.01',
      )
      const stepSize = parseFloat(
        s.filters.find(f => f.filterType === 'LOT_SIZE')?.stepSize ?? '0.001',
      )

      ranked.push({
        market: {
          // Binance v3/api endpoints are spot, not perp. Reflect that
          // honestly in the id so the dropdown does not mislead.
          // Switch to fapi.binance.com if you ever want real perps.
          id: `${s.baseAsset}/${s.quoteAsset}`,
          base: s.baseAsset,
          quote: s.quoteAsset,
          kind: 'spot',
          venueSymbol: s.symbol,
          tickSize: Number.isFinite(tickSize) && tickSize > 0 ? tickSize : 0.01,
          stepSize: Number.isFinite(stepSize) && stepSize > 0 ? stepSize : 0.001,
        },
        volume: volumeBySymbol.get(s.symbol) ?? 0,
      })
    }

    // Sort by 24h quote volume desc, take top N.
    ranked.sort((a, b) => b.volume - a.volume)
    const next = ranked.slice(0, MAX_PAIRS).map(r => r.market)

    this.markets = next

    // Push the symbol filter into the ticker singleton so its WS
    // dispatcher only forwards frames for pairs the UI cares about.
    const symbolMap: Record<string, string> = {}
    for (const m of next) symbolMap[m.venueSymbol] = m.id
    binanceTicker.setSymbols(symbolMap)
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
