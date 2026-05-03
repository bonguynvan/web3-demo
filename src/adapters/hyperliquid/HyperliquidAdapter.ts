/**
 * HyperliquidAdapter — read-only public-data implementation.
 *
 * Phase-1 scope: ticker, klines, order book, market metadata. All public
 * endpoints, no auth required.
 *
 * Trading methods (placeOrder, cancelOrder, ...) are stubbed and will be
 * wired up via wagmi EIP-712 signing in a follow-up — Hyperliquid orders
 * are signed by the user's wallet, no server-side key custody needed.
 *
 * API references:
 *   REST   https://api.hyperliquid.xyz/info  (type-tagged JSON POST)
 *   WS     wss://api.hyperliquid.xyz/ws       ({method,subscription} JSON)
 */

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
  WalletCredentials,
} from '../types'

const REST_URL = 'https://api.hyperliquid.xyz/info'
const WS_URL = 'wss://api.hyperliquid.xyz/ws'

/** Cap the dropdown at this many pairs, ranked by 24h notional volume desc. */
const MAX_PAIRS = 30

const TF_TO_HL: Record<TimeFrame, string> = {
  '1m':  '1m',  '3m':  '3m',  '5m':  '5m',  '15m': '15m', '30m': '30m',
  '1h':  '1h',  '2h':  '2h',  '4h':  '4h',
  '6h':  '4h',  // HL has no 6h — round down to 4h
  '12h': '12h', '1d':  '1d',  '1w':  '1w',
}

interface HlUniverseEntry {
  name: string
  szDecimals: number
  maxLeverage?: number
}

interface HlAssetCtx {
  markPx: string
  prevDayPx: string
  dayNtlVlm: string
  oraclePx: string
  funding: string
  openInterest?: string
}

interface HlCandle {
  t: number  // open time (ms)
  o: string
  h: string
  l: string
  c: string
  v: string
}

interface HlLevel {
  px: string
  sz: string
  n: number
}

interface HlL2Book {
  coin: string
  levels: [HlLevel[], HlLevel[]]  // [bids, asks]
  time: number
}

function venueError(message: string, retryable: boolean, isReject: boolean): VenueError {
  const e = new Error(`Hyperliquid: ${message}`) as VenueError
  e.venue = 'hyperliquid'
  e.retryable = retryable
  e.isReject = isReject
  return e
}

function notImplemented(method: string): VenueError {
  return venueError(`${method} not implemented in phase 1`, false, true)
}

async function postInfo<T>(body: object): Promise<T> {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw venueError(`info ${res.status}`, res.status >= 500, res.status < 500)
  }
  return res.json() as Promise<T>
}

export class HyperliquidAdapter implements VenueAdapter {
  readonly id: VenueId = 'hyperliquid'
  readonly displayName = 'Hyperliquid'

  readonly capabilities: VenueCapabilities = {
    spot: false,
    perp: true,
    trading: false,
    websocketTickers: true,
    websocketOrderBook: true,
    websocketTrades: true,
    websocketFills: true,
    conditionalOrders: true,
    reduceOnly: true,
    postOnly: true,
  }

  // ─── Internal state ─────────────────────────────────────────────────

  private markets: Market[] = []
  private marketByCoin = new Map<string, Market>()
  private tickerCache = new Map<string, Ticker>()
  private ws: WebSocket | null = null
  private wsConnecting = false
  private subs = new Map<string, Set<(payload: unknown) => void>>()
  private auth: WalletCredentials | null = null

  // ─── Lifecycle ──────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.markets.length === 0) {
      await this.refreshMarkets()
    }
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this.subs.clear()
  }

  async authenticate(creds: VenueCredentials): Promise<void> {
    if (creds.kind !== 'wallet') {
      throw venueError(
        'Hyperliquid requires wallet credentials (kind: "wallet")',
        false, true,
      )
    }
    this.auth = creds
    // capabilities is `readonly` at the type level; cast through to flip
    // the runtime flag without leaking mutability into the public type.
    ;(this.capabilities as { trading: boolean }).trading = true
  }

  /** True once authenticate() has been called with valid wallet creds. */
  isAuthenticated(): boolean {
    return this.auth !== null
  }

  /**
   * Hyperliquid clearinghouse snapshot for the connected wallet.
   * Public `/info` endpoint — no signing required. Returns the raw HL
   * shape (assetPositions, marginSummary, etc.); higher layers can
   * normalise fields they care about.
   */
  async getAccountSnapshot(): Promise<unknown> {
    if (!this.auth) {
      throw venueError('not authenticated — call authenticate(walletCreds) first', false, true)
    }
    return postInfo({
      type: 'clearinghouseState',
      user: this.auth.address,
    })
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
    const data = await postInfo<[{ universe: HlUniverseEntry[] }, HlAssetCtx[]]>({
      type: 'metaAndAssetCtxs',
    })
    if (!Array.isArray(data) || data.length < 2) {
      throw venueError('metaAndAssetCtxs: malformed response', true, false)
    }
    const [meta, ctxs] = data

    // Pair each universe entry with its asset context so we can rank by
    // 24h notional volume (dayNtlVlm) before slicing.
    type Ranked = { market: Market; ctx: HlAssetCtx; volume: number }
    const ranked: Ranked[] = []
    for (let i = 0; i < meta.universe.length; i++) {
      const u = meta.universe[i]
      const ctx = ctxs[i]
      if (!ctx) continue
      const market: Market = {
        id: `${u.name}-PERP`,
        base: u.name,
        quote: 'USD',
        kind: 'perp',
        venueSymbol: u.name,
        // HL perps: pxDecimals = 6 - szDecimals; tick = 10^-pxDec, step = 10^-szDec
        tickSize: Math.pow(10, -(6 - u.szDecimals)),
        stepSize: Math.pow(10, -u.szDecimals),
        maxLeverage: u.maxLeverage,
      }
      ranked.push({ market, ctx, volume: parseFloat(ctx.dayNtlVlm) || 0 })
    }
    ranked.sort((a, b) => b.volume - a.volume)
    const top = ranked.slice(0, MAX_PAIRS)

    this.markets = top.map(r => r.market)
    this.marketByCoin.clear()
    for (const m of this.markets) this.marketByCoin.set(m.venueSymbol, m)

    // Seed ticker cache from the same call (saves a RTT)
    const now = Date.now()
    for (const r of top) {
      const price = parseFloat(r.ctx.markPx)
      const open = parseFloat(r.ctx.prevDayPx)
      this.tickerCache.set(r.market.id, {
        marketId: r.market.id,
        price,
        open24h: open,
        high24h: 0,
        low24h: 0,
        change24hPct: open > 0 ? ((price - open) / open) * 100 : 0,
        volume24hQuote: r.volume,
        fundingRate: parseFloat(r.ctx.funding),
        receivedAt: now,
      })
    }
  }

  // ─── Tickers ────────────────────────────────────────────────────────

  getTicker(marketId: string): Ticker | undefined {
    return this.tickerCache.get(marketId)
  }

  subscribeTicker(marketId: string, cb: (t: Ticker) => void): Unsubscribe {
    const market = this.getMarket(marketId)
    if (!market) return () => {}

    const handler = (payload: unknown) => {
      const data = payload as { mids?: Record<string, string> }
      if (!data.mids) return
      const mid = data.mids[market.venueSymbol]
      if (!mid) return
      const price = parseFloat(mid)
      const prev = this.tickerCache.get(marketId)
      const next: Ticker = {
        ...(prev ?? {
          marketId,
          open24h: 0, high24h: 0, low24h: 0,
          change24hPct: 0, volume24hQuote: 0,
        }),
        marketId,
        price,
        receivedAt: Date.now(),
      }
      if (next.open24h > 0) {
        next.change24hPct = ((price - next.open24h) / next.open24h) * 100
      }
      this.tickerCache.set(marketId, next)
      cb(next)
    }

    return this.subscribeWs({ type: 'allMids' }, handler)
  }

  // ─── Klines ─────────────────────────────────────────────────────────

  async getKlines(
    marketId: string,
    timeframe: TimeFrame,
    opts: { limit?: number; endTime?: number } = {},
  ): Promise<Candle[]> {
    const market = this.getMarket(marketId)
    if (!market) throw venueError(`unknown market ${marketId}`, false, true)

    const endTime = opts.endTime ?? Date.now()
    const limit = opts.limit ?? 500
    // HL doesn't accept a `limit` param; approximate via startTime window.
    const startTime = endTime - limit * intervalToMs(timeframe)

    const rows = await postInfo<HlCandle[]>({
      type: 'candleSnapshot',
      req: {
        coin: market.venueSymbol,
        interval: TF_TO_HL[timeframe],
        startTime,
        endTime,
      },
    })
    if (!Array.isArray(rows)) {
      throw venueError('candleSnapshot: malformed response', true, false)
    }
    return rows.map((r): Candle => ({
      time: r.t,
      open: parseFloat(r.o),
      high: parseFloat(r.h),
      low: parseFloat(r.l),
      close: parseFloat(r.c),
      volume: parseFloat(r.v),
    }))
  }

  subscribeKlines(
    marketId: string,
    timeframe: TimeFrame,
    cb: (c: Candle) => void,
  ): Unsubscribe {
    const market = this.getMarket(marketId)
    if (!market) return () => {}

    const handler = (payload: unknown) => {
      const c = payload as HlCandle
      if (typeof c?.t !== 'number') return
      cb({
        time: c.t,
        open: parseFloat(c.o),
        high: parseFloat(c.h),
        low: parseFloat(c.l),
        close: parseFloat(c.c),
        volume: parseFloat(c.v),
      })
    }

    return this.subscribeWs({
      type: 'candle',
      coin: market.venueSymbol,
      interval: TF_TO_HL[timeframe],
    }, handler)
  }

  // ─── Order book ─────────────────────────────────────────────────────

  async getOrderBook(marketId: string, _depth?: number): Promise<OrderBook> {
    const market = this.getMarket(marketId)
    if (!market) throw venueError(`unknown market ${marketId}`, false, true)

    const book = await postInfo<HlL2Book>({
      type: 'l2Book',
      coin: market.venueSymbol,
    })
    return l2BookToCanonical(marketId, book)
  }

  subscribeOrderBook(marketId: string, cb: (b: OrderBook) => void): Unsubscribe {
    const market = this.getMarket(marketId)
    if (!market) return () => {}

    const handler = (payload: unknown) => {
      const book = payload as HlL2Book
      if (!book?.levels) return
      cb(l2BookToCanonical(marketId, book))
    }

    return this.subscribeWs({
      type: 'l2Book',
      coin: market.venueSymbol,
    }, handler)
  }

  subscribeTrades(marketId: string, cb: (t: PublicTrade) => void): Unsubscribe {
    const market = this.getMarket(marketId)
    if (!market) return () => {}

    const handler = (payload: unknown) => {
      const trades = payload as Array<{
        coin: string; side: 'A' | 'B'; px: string; sz: string;
        time: number; tid: number;
      }>
      if (!Array.isArray(trades)) return
      for (const tr of trades) {
        cb({
          id: String(tr.tid),
          marketId,
          side: tr.side === 'B' ? 'buy' : 'sell',
          price: parseFloat(tr.px),
          size: parseFloat(tr.sz),
          timestamp: tr.time,
        })
      }
    }

    return this.subscribeWs({
      type: 'trades',
      coin: market.venueSymbol,
    }, handler)
  }

  // ─── Account / trading — phase 2b stubs ────────────────────────────

  async getBalances(): Promise<Balance[]> { throw notImplemented('getBalances') }
  subscribeBalances(_cb: (b: Balance[]) => void): Unsubscribe { return () => {} }
  async getPositions(): Promise<Position[]> { throw notImplemented('getPositions') }
  subscribePositions(_cb: (p: Position[]) => void): Unsubscribe { return () => {} }
  async getOpenOrders(marketId?: string): Promise<Order[]> {
    if (!this.auth) {
      throw venueError('not authenticated — call authenticate(walletCreds) first', false, true)
    }
    // Hyperliquid /info endpoint with { type: 'openOrders', user } returns
    // open orders for the wallet — no signing required.
    type HlOpenOrder = {
      coin: string
      limitPx: string
      sz: string
      side: 'B' | 'A'
      timestamp: number
      origSz: string
      oid: number
    }
    const orders = await postInfo<HlOpenOrder[]>({
      type: 'openOrders',
      user: this.auth.address,
    })
    if (!Array.isArray(orders)) return []
    const filtered = marketId
      ? orders.filter(o => `${o.coin}-PERP` === marketId)
      : orders
    return filtered.map<Order>(o => {
      const orig = parseFloat(o.origSz)
      const remaining = parseFloat(o.sz)
      const filled = Math.max(0, orig - remaining)
      return {
        id: String(o.oid),
        marketId: `${o.coin}-PERP`,
        side: o.side === 'B' ? 'buy' : 'sell',
        type: 'limit',
        tif: 'gtc',
        price: parseFloat(o.limitPx) || undefined,
        size: orig,
        filledSize: filled,
        status: filled > 0 ? 'partially_filled' : 'open',
        createdAt: o.timestamp,
        updatedAt: o.timestamp,
      }
    })
  }
  subscribeOrders(_cb: (o: Order) => void): Unsubscribe { return () => {} }
  subscribeFills(_cb: (f: Fill) => void): Unsubscribe { return () => {} }
  /**
   * placeOrder — sketch only; signing not yet wired.
   *
   * What works:
   *   - Validates intent shape and authentication state
   *   - Resolves market → asset index
   *   - Formats price/size strings against the market's pxDecimals/szDecimals
   *   - Builds the canonical Hyperliquid order action JSON
   *
   * What's missing (next session, validate against testnet first):
   *
   *   1. Action hash (keccak256 of msgpack-encoded action || nonce || vaultAddr).
   *      msgpack-encoding is non-trivial — recommend importing
   *      `@msgpack/msgpack` or using Hyperliquid's official TS SDK rather
   *      than hand-rolling.
   *
   *   2. EIP-712 sign via this.auth.signTypedData with:
   *        domain      = { name: "Exchange", version: "1", chainId: 1337,
   *                        verifyingContract: "0x0000000000000000000000000000000000000000" }
   *        types.Agent = [{name:"source", type:"string"},
   *                       {name:"connectionId", type:"bytes32"}]
   *        primaryType = "Agent"
   *        message     = { source: "a" /-mainnet- or "b" /-testnet-/,
   *                        connectionId: <action_hash> }
   *      The `source` discriminator + chainId 1337 are intentional — verify
   *      against the current Hyperliquid signing docs before live use, the
   *      domain has changed historically.
   *
   *   3. POST to https://api.hyperliquid.xyz/exchange with
   *        { action, nonce, signature: { r, s, v }, vaultAddress: null }
   *      Map response (`status: "ok"` / `"err"`) to canonical Order.
   *
   *   4. Builder code: inject env VITE_HYPERLIQUID_BUILDER_CODE into the
   *      action.builder field so this venue's per-trade rebate routes here.
   */
  async placeOrder(intent: PlaceOrderIntent): Promise<Order> {
    if (!this.auth) {
      throw venueError('not authenticated — call authenticate(walletCreds) first', false, true)
    }
    const market = this.getMarket(intent.marketId)
    if (!market) {
      throw venueError(`unknown market ${intent.marketId}`, false, true)
    }
    const assetIndex = this.markets.findIndex(m => m.id === market.id)
    if (assetIndex < 0) {
      throw venueError(`asset index lookup failed for ${intent.marketId}`, false, true)
    }
    if (intent.size === undefined && intent.notional === undefined) {
      throw venueError('intent must specify size or notional', false, true)
    }

    // Build wire-shape order. HL accepts price as string with up to
    // (6 - szDecimals) decimal places; size with up to szDecimals.
    const pxDecimals = 6 - Math.round(Math.log10(1 / market.stepSize))
    const sizeBase = intent.size ?? (intent.notional! / (intent.price ?? 0))
    if (!Number.isFinite(sizeBase) || sizeBase <= 0) {
      throw venueError('cannot derive size from intent', false, true)
    }

    const _wireOrder = {
      a: assetIndex,
      b: intent.side === 'buy',
      p: intent.price !== undefined ? intent.price.toFixed(Math.max(pxDecimals, 0)) : '0',
      s: sizeBase.toFixed(Math.round(Math.log10(1 / market.stepSize))),
      r: intent.reduceOnly ?? false,
      t: intent.type === 'market'
        ? { limit: { tif: 'Ioc' as const } }   // HL has no native market — IOC limit at slippage cap
        : { limit: { tif: intent.tif === 'post_only' ? ('Alo' as const) : ('Gtc' as const) } },
    }
    const _action = {
      type: 'order' as const,
      orders: [_wireOrder],
      grouping: 'na' as const,
    }
    const _nonce = Date.now()

    // The remaining steps are documented in the JSDoc above. Don't ship
    // signed transactions without testnet validation.
    throw venueError(
      'placeOrder signing not yet wired. See the JSDoc above for the exact ' +
      'EIP-712 + msgpack recipe; validate against api.hyperliquid-testnet.xyz ' +
      'before enabling on mainnet.',
      false, true,
    )
  }
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

  // ─── WebSocket multiplexer ──────────────────────────────────────────

  private subscribeWs(subscription: object, cb: (payload: unknown) => void): Unsubscribe {
    const key = JSON.stringify(subscription)
    let handlers = this.subs.get(key)
    if (!handlers) {
      handlers = new Set()
      this.subs.set(key, handlers)
    }
    handlers.add(cb)

    void this.ensureWsOpen().then(() => {
      this.send({ method: 'subscribe', subscription })
    })

    return () => {
      handlers!.delete(cb)
      if (handlers!.size === 0) {
        this.subs.delete(key)
        this.send({ method: 'unsubscribe', subscription })
      }
    }
  }

  private async ensureWsOpen(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    if (this.wsConnecting) {
      await new Promise(r => setTimeout(r, 100))
      return this.ensureWsOpen()
    }
    this.wsConnecting = true
    try {
      const ws = new WebSocket(WS_URL)
      this.ws = ws
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new Error('ws error'))
      })
      ws.onmessage = (event) => this.handleWsMessage(event.data as string)
      ws.onclose = () => {
        this.ws = null
        // Auto-reconnect if any subs remain
        if (this.subs.size > 0) {
          setTimeout(() => {
            void this.ensureWsOpen().then(() => {
              for (const key of this.subs.keys()) {
                this.send({ method: 'subscribe', subscription: JSON.parse(key) })
              }
            })
          }, 1000)
        }
      }
    } finally {
      this.wsConnecting = false
    }
  }

  private send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private handleWsMessage(raw: string): void {
    let frame: { channel?: string; data?: unknown }
    try { frame = JSON.parse(raw) } catch { return }
    if (!frame.channel || frame.data === undefined) return

    if (frame.channel === 'allMids') {
      const handlers = this.subs.get(JSON.stringify({ type: 'allMids' }))
      if (handlers) for (const cb of handlers) cb(frame.data)
      return
    }
    // Per-coin channels — match by subscription type + coin field
    for (const [key, handlers] of this.subs) {
      const sub = JSON.parse(key) as { type?: string; coin?: string; interval?: string }
      if (sub.type !== frame.channel) continue
      const data = frame.data as { coin?: string; s?: string }
      const dataCoin = data.coin ?? data.s
      if (sub.coin && dataCoin && sub.coin !== dataCoin) continue
      for (const cb of handlers) cb(frame.data)
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function l2BookToCanonical(marketId: string, book: HlL2Book): OrderBook {
  const [bidLevels, askLevels] = book.levels
  return {
    marketId,
    bids: (bidLevels ?? []).map(l => ({ price: parseFloat(l.px), size: parseFloat(l.sz) })),
    asks: (askLevels ?? []).map(l => ({ price: parseFloat(l.px), size: parseFloat(l.sz) })),
    receivedAt: book.time ?? Date.now(),
  }
}

function intervalToMs(tf: TimeFrame): number {
  switch (tf) {
    case '1m':  return 60_000
    case '3m':  return 180_000
    case '5m':  return 300_000
    case '15m': return 900_000
    case '30m': return 1_800_000
    case '1h':  return 3_600_000
    case '2h':  return 7_200_000
    case '4h':  return 14_400_000
    case '6h':  return 21_600_000
    case '12h': return 43_200_000
    case '1d':  return 86_400_000
    case '1w':  return 604_800_000
  }
}
