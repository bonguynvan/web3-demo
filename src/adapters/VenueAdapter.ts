/**
 * VenueAdapter — the single interface every venue (Binance, Hyperliquid,
 * Bybit, demo) must implement.
 *
 * Design rules:
 *
 * 1. Read-only methods never throw on missing data. They return empty
 *    arrays / undefined. Throwing is reserved for protocol violations.
 *
 * 2. Streams use the subscribe-pattern from binanceTicker.ts — caller
 *    gets an Unsubscribe back. The adapter owns the socket lifecycle.
 *
 * 3. Trading methods return the canonical Order/Position the venue
 *    confirmed, NOT a transaction hash. The matching engine is the
 *    source of truth, not a chain.
 *
 * 4. Idempotency via clientId. Re-submitting an intent with the same
 *    clientId must not double-fire. Adapters that don't support native
 *    idempotency must implement it themselves with a short-lived cache.
 *
 * 5. Errors are VenueError instances. Native errors are wrapped so the
 *    UI can decide retryable vs reject without knowing the venue.
 */

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
  TimeFrame,
  Ticker,
  Unsubscribe,
  VenueCapabilities,
  VenueCredentials,
  VenueId,
} from './types'

export interface VenueAdapter {
  // ─── Identity ───────────────────────────────────────────────────────

  readonly id: VenueId
  readonly displayName: string
  readonly capabilities: VenueCapabilities

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /** Establish public connections (markets, tickers). Idempotent. */
  connect(): Promise<void>

  /** Tear down sockets. Idempotent. */
  disconnect(): Promise<void>

  /**
   * Authenticate. After this resolves, capabilities.trading === true and
   * account-scoped methods are usable. Without credentials the adapter
   * stays in read-only mode.
   */
  authenticate(creds: VenueCredentials): Promise<void>

  // ─── Market metadata ────────────────────────────────────────────────

  listMarkets(): Promise<Market[]>
  getMarket(marketId: string): Market | undefined

  // ─── Public market data ─────────────────────────────────────────────

  getTicker(marketId: string): Ticker | undefined
  subscribeTicker(marketId: string, cb: (t: Ticker) => void): Unsubscribe

  getKlines(
    marketId: string,
    timeframe: TimeFrame,
    opts?: { limit?: number; endTime?: number },
  ): Promise<Candle[]>
  subscribeKlines(
    marketId: string,
    timeframe: TimeFrame,
    cb: (c: Candle) => void,
  ): Unsubscribe

  getOrderBook(marketId: string, depth?: number): Promise<OrderBook>
  subscribeOrderBook(marketId: string, cb: (b: OrderBook) => void): Unsubscribe

  subscribeTrades(marketId: string, cb: (t: PublicTrade) => void): Unsubscribe

  // ─── Account (requires authenticate) ───────────────────────────────

  getBalances(): Promise<Balance[]>
  subscribeBalances(cb: (b: Balance[]) => void): Unsubscribe

  getPositions(): Promise<Position[]>
  subscribePositions(cb: (p: Position[]) => void): Unsubscribe

  getOpenOrders(marketId?: string): Promise<Order[]>
  subscribeOrders(cb: (o: Order) => void): Unsubscribe

  subscribeFills(cb: (f: Fill) => void): Unsubscribe

  // ─── Trading ────────────────────────────────────────────────────────

  placeOrder(intent: PlaceOrderIntent): Promise<Order>
  cancelOrder(args: { marketId: string; orderId: string }): Promise<void>
  cancelAllOrders(marketId?: string): Promise<void>

  /**
   * Adjust leverage / cross-vs-isolated. Adapter throws VenueError with
   * isReject=true if the venue doesn't support the requested mode.
   */
  setLeverage(args: { marketId: string; leverage: number }): Promise<void>

  /** Close at market — sugar over placeOrder with reduceOnly. */
  closePosition(args: {
    marketId: string
    /** Fraction 0..1, defaults to 1 (full close). */
    fraction?: number
    slippageBps?: number
  }): Promise<Order>
}
