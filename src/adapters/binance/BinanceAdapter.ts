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
import { buildSignedQuery } from '../../lib/binanceAuth'
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

function mapBinanceOrderType(t: string): Order['type'] {
  switch (t) {
    case 'LIMIT': case 'LIMIT_MAKER': return 'limit'
    case 'MARKET': return 'market'
    case 'STOP_LOSS': return 'stop'
    case 'STOP_LOSS_LIMIT': return 'stop_limit'
    case 'TAKE_PROFIT': case 'TAKE_PROFIT_LIMIT': return 'take_profit'
    default: return 'limit'
  }
}

function mapBinanceTif(t: string | undefined): Order['tif'] {
  switch (t) {
    case 'IOC': return 'ioc'
    case 'FOK': return 'fok'
    case 'GTX': return 'post_only'
    default: return 'gtc'
  }
}

function tifToBinance(tif: 'gtc' | 'ioc' | 'fok' | 'post_only'): string {
  switch (tif) {
    case 'ioc': return 'IOC'
    case 'fok': return 'FOK'
    case 'post_only': return 'GTX'
    default: return 'GTC'
  }
}

function mapBinanceOrderStatus(s: string): Order['status'] {
  switch (s) {
    case 'NEW': return 'open'
    case 'PARTIALLY_FILLED': return 'partially_filled'
    case 'FILLED': return 'filled'
    case 'CANCELED': case 'PENDING_CANCEL': return 'canceled'
    case 'REJECTED': return 'rejected'
    case 'EXPIRED': case 'EXPIRED_IN_MATCH': return 'expired'
    default: return 'open'
  }
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
  // Authenticated session — set by authenticate(), cleared on disconnect.
  // Lives only in memory; the vault layer is responsible for persistence.
  private creds: { apiKey: string; apiSecret: string; readOnly: boolean } | null = null

  // ─── Lifecycle ──────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.markets.length === 0) await this.refreshMarkets()
  }

  async disconnect(): Promise<void> {
    // Singleton manages its own lifecycle by subscriber count.
  }

  async authenticate(creds: VenueCredentials): Promise<void> {
    if (creds.kind !== 'apiKey') {
      throw new Error('Binance requires apiKey credentials')
    }
    if (!creds.apiKey || !creds.apiSecret) {
      throw new Error('Both apiKey and apiSecret are required')
    }
    this.creds = {
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret,
      readOnly: creds.readOnly !== false,
    }
    // Flip trading capability based on the connected key's scope.
    this.capabilities.trading = !this.creds.readOnly
  }

  /** True once authenticate() has been called with valid creds. */
  isAuthenticated(): boolean {
    return this.creds !== null
  }

  /**
   * Signed REST call to /api/v3/account. Returns the raw Binance shape;
   * higher layers can map balances into venue-agnostic types.
   * Throws if not yet authenticated.
   */
  async getAccountSnapshot(): Promise<unknown> {
    if (!this.creds) throw new Error('Not authenticated — call authenticate() first')
    const query = await buildSignedQuery(this.creds.apiSecret)
    const res = await fetch(`${REST_BASE}/api/v3/account?${query}`, {
      headers: { 'X-MBX-APIKEY': this.creds.apiKey },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Binance account fetch failed: ${res.status} ${body}`)
    }
    return res.json()
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
  async getOpenOrders(marketId?: string): Promise<Order[]> {
    if (!this.creds) throw new Error('Not authenticated — call authenticate() first')
    const extra: Record<string, string> = {}
    if (marketId) {
      const m = this.markets.find(mk => mk.id === marketId)
      if (m?.venueSymbol) extra.symbol = m.venueSymbol
    }
    const query = await buildSignedQuery(this.creds.apiSecret, extra)
    const res = await fetch(`${REST_BASE}/api/v3/openOrders?${query}`, {
      headers: { 'X-MBX-APIKEY': this.creds.apiKey },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Binance openOrders failed: ${res.status} ${body}`)
    }
    const raw = await res.json() as Array<{
      orderId: number; clientOrderId?: string; symbol: string
      price: string; origQty: string; executedQty: string
      side: 'BUY' | 'SELL'; type: string; timeInForce?: string
      status: string; time: number; updateTime: number
    }>
    const symbolToId = new Map(this.markets.map(m => [m.venueSymbol, m.id]))
    return raw.map<Order>(o => ({
      id: String(o.orderId),
      clientId: o.clientOrderId,
      marketId: symbolToId.get(o.symbol) ?? o.symbol,
      side: o.side === 'BUY' ? 'buy' : 'sell',
      type: mapBinanceOrderType(o.type),
      tif: mapBinanceTif(o.timeInForce),
      price: parseFloat(o.price) || undefined,
      size: parseFloat(o.origQty),
      filledSize: parseFloat(o.executedQty),
      avgFillPrice: undefined,
      status: mapBinanceOrderStatus(o.status),
      createdAt: o.time,
      updatedAt: o.updateTime,
    }))
  }
  subscribeOrders(_cb: (o: Order) => void): Unsubscribe { return () => {} }
  subscribeFills(_cb: (f: Fill) => void): Unsubscribe { return () => {} }
  async placeOrder(intent: PlaceOrderIntent): Promise<Order> {
    if (!this.creds) throw new Error('Not authenticated — call authenticate() first')
    if (this.creds.readOnly) throw new Error('Cannot place order: API key is read-only')
    if (intent.type !== 'limit') {
      throw new Error('Only limit orders are supported in this build (safer default)')
    }
    if (!intent.size || intent.size <= 0) throw new Error('size > 0 required')
    if (!intent.price || intent.price <= 0) throw new Error('price > 0 required for limit')
    const m = this.markets.find(mk => mk.id === intent.marketId)
    if (!m?.venueSymbol) throw new Error(`Unknown market: ${intent.marketId}`)

    const params: Record<string, string | number> = {
      symbol: m.venueSymbol,
      side: intent.side === 'buy' ? 'BUY' : 'SELL',
      type: 'LIMIT',
      timeInForce: tifToBinance(intent.tif ?? 'gtc'),
      quantity: intent.size,
      price: intent.price,
    }
    if (intent.clientId) params.newClientOrderId = intent.clientId
    const query = await buildSignedQuery(this.creds.apiSecret, params)
    const res = await fetch(`${REST_BASE}/api/v3/order?${query}`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': this.creds.apiKey },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Binance placeOrder failed: ${res.status} ${body}`)
    }
    const o = await res.json() as {
      orderId: number; clientOrderId?: string; symbol: string
      price: string; origQty: string; executedQty: string
      side: 'BUY' | 'SELL'; type: string; timeInForce?: string
      status: string; transactTime: number
    }
    return {
      id: String(o.orderId),
      clientId: o.clientOrderId,
      marketId: intent.marketId,
      side: o.side === 'BUY' ? 'buy' : 'sell',
      type: mapBinanceOrderType(o.type),
      tif: mapBinanceTif(o.timeInForce),
      price: parseFloat(o.price) || undefined,
      size: parseFloat(o.origQty),
      filledSize: parseFloat(o.executedQty),
      status: mapBinanceOrderStatus(o.status),
      createdAt: o.transactTime,
      updatedAt: o.transactTime,
    }
  }
  async cancelOrder(args: { marketId: string; orderId: string }): Promise<void> {
    if (!this.creds) throw new Error('Not authenticated — call authenticate() first')
    if (this.creds.readOnly) throw new Error('Cannot cancel: API key is read-only')
    const m = this.markets.find(mk => mk.id === args.marketId)
    if (!m?.venueSymbol) throw new Error(`Unknown market: ${args.marketId}`)
    const query = await buildSignedQuery(this.creds.apiSecret, {
      symbol: m.venueSymbol,
      orderId: args.orderId,
    })
    const res = await fetch(`${REST_BASE}/api/v3/order?${query}`, {
      method: 'DELETE',
      headers: { 'X-MBX-APIKEY': this.creds.apiKey },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Binance cancelOrder failed: ${res.status} ${body}`)
    }
  }
  async cancelAllOrders(_marketId?: string): Promise<void> { throw notImplemented('cancelAllOrders') }

  /**
   * Recent fills for a single market via signed `/api/v3/myTrades`.
   * Returns up to `limit` fills (default 25, max 1000) sorted newest first.
   */
  async getRecentFills(marketId: string, limit = 25): Promise<Fill[]> {
    if (!this.creds) throw new Error('Not authenticated — call authenticate() first')
    const m = this.markets.find(mk => mk.id === marketId)
    if (!m?.venueSymbol) throw new Error(`Unknown market: ${marketId}`)
    const query = await buildSignedQuery(this.creds.apiSecret, {
      symbol: m.venueSymbol,
      limit: Math.min(1000, Math.max(1, limit)),
    })
    const res = await fetch(`${REST_BASE}/api/v3/myTrades?${query}`, {
      headers: { 'X-MBX-APIKEY': this.creds.apiKey },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Binance myTrades failed: ${res.status} ${body}`)
    }
    const raw = await res.json() as Array<{
      id: number; orderId: number; symbol: string
      price: string; qty: string; commission: string; commissionAsset: string
      isBuyer: boolean; time: number
    }>
    return raw
      .map<Fill>(t => ({
        id: String(t.id),
        orderId: String(t.orderId),
        marketId,
        side: t.isBuyer ? 'buy' : 'sell',
        price: parseFloat(t.price),
        size: parseFloat(t.qty),
        feeAsset: t.commissionAsset,
        fee: parseFloat(t.commission),
        timestamp: t.time,
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
  }
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
