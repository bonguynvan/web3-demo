/**
 * Canonical types for the venue adapter layer.
 *
 * Every venue (Binance, Hyperliquid, Bybit, etc.) maps its native shapes
 * into these so the UI and hooks never need to know which venue they're
 * talking to. Modelled on the shapes already used in src/hooks/* and
 * src/lib/binanceTicker.ts so the migration is mechanical.
 */

export type VenueId = 'binance' | 'hyperliquid' | 'bybit' | 'demo'

export type VenueKind = 'cex' | 'dex'

export type MarketKind = 'spot' | 'perp'

export type Side = 'buy' | 'sell'

export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'take_profit'

export type TimeInForce = 'gtc' | 'ioc' | 'fok' | 'post_only'

export type TimeFrame =
  | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '12h'
  | '1d' | '1w'

/** Canonical market identifier — venue-independent, e.g. "ETH-PERP". */
export interface Market {
  id: string                    // "ETH-PERP" — stable across venues
  base: string                  // "ETH"
  quote: string                 // "USDT" / "USDC" / "USD"
  kind: MarketKind
  venueSymbol: string           // "ETHUSDT" on Binance, "ETH" on Hyperliquid
  tickSize: number              // price tick in quote units
  stepSize: number              // size step in base units
  minNotional?: number
  maxLeverage?: number
}

export interface Ticker {
  marketId: string
  price: number
  open24h: number
  high24h: number
  low24h: number
  change24hPct: number
  volume24hQuote: number
  fundingRate?: number          // perps only
  nextFundingAt?: number        // ms epoch
  receivedAt: number            // ms epoch
}

export interface Candle {
  time: number                  // ms epoch, bucket start
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OrderBookLevel {
  price: number
  size: number
}

export interface OrderBook {
  marketId: string
  bids: OrderBookLevel[]        // sorted high → low
  asks: OrderBookLevel[]        // sorted low → high
  receivedAt: number
}

export interface PublicTrade {
  id: string
  marketId: string
  side: Side
  price: number
  size: number
  timestamp: number
}

// ─── Account-scoped types ─────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'open'
  | 'partially_filled'
  | 'filled'
  | 'canceled'
  | 'rejected'
  | 'expired'

export interface Order {
  id: string                    // venue-assigned
  clientId?: string             // our idempotency key
  marketId: string
  side: Side
  type: OrderType
  tif: TimeInForce
  price?: number                // undefined for market
  triggerPrice?: number
  size: number                  // base units
  filledSize: number
  avgFillPrice?: number
  reduceOnly?: boolean
  status: OrderStatus
  createdAt: number
  updatedAt: number
}

export interface Position {
  marketId: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  markPrice: number
  liquidationPrice?: number
  leverage: number
  marginUsd: number
  unrealizedPnlUsd: number
  realizedPnlUsd: number
  fundingPaidUsd: number
  updatedAt: number
}

export interface Balance {
  asset: string
  free: number
  locked: number                // in open orders / as margin
  total: number
}

export interface Fill {
  id: string
  orderId: string
  marketId: string
  side: Side
  price: number
  size: number
  feeAsset: string
  fee: number
  timestamp: number
}

// ─── Order intents — what the UI hands the adapter ───────────────────

export interface PlaceOrderIntent {
  marketId: string
  side: Side
  type: OrderType
  tif?: TimeInForce
  /** Either size (base) or notional (quote); adapter resolves which the venue accepts. */
  size?: number
  notional?: number
  price?: number
  triggerPrice?: number
  reduceOnly?: boolean
  /** Slippage cap in bps. Adapter converts to limit price for market orders. */
  slippageBps?: number
  clientId?: string
}

// ─── Streaming primitive ──────────────────────────────────────────────

export type Unsubscribe = () => void

// ─── Capability flags — venues differ ────────────────────────────────

export interface VenueCapabilities {
  spot: boolean
  perp: boolean
  trading: boolean              // false when no key / read-only
  websocketTickers: boolean
  websocketOrderBook: boolean
  websocketTrades: boolean
  websocketFills: boolean
  conditionalOrders: boolean    // stop / take-profit
  reduceOnly: boolean
  postOnly: boolean
}

/**
 * Venue auth comes in two flavors:
 *
 * - API-key venues (Binance, Bybit, OKX): user pastes a key + secret
 *   into a settings page. Server-side proxy holds the key and signs
 *   each REST call. UI never sees the secret.
 *
 * - Wallet venues (Hyperliquid, dYdX v4): user signs each action with
 *   their connected wallet via EIP-712 typed-data. No key custody —
 *   the signing fn comes from wagmi/viem's WalletClient.
 *
 * Discriminator is `kind`. Adapters narrow on it inside authenticate().
 */
export type VenueCredentials = ApiKeyCredentials | WalletCredentials

export interface ApiKeyCredentials {
  kind: 'apiKey'
  apiKey: string
  apiSecret: string
  passphrase?: string           // Bybit / OKX
  readOnly?: boolean
}

export interface WalletCredentials {
  kind: 'wallet'
  address: `0x${string}`
  /**
   * EIP-712 typed-data signer. Shape matches viem's WalletClient.signTypedData
   * so wagmi consumers can pass it directly.
   */
  signTypedData: (params: {
    domain: TypedDataDomain
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: string
    message: Record<string, unknown>
  }) => Promise<`0x${string}`>
  /** Optional sub-key (HL "API wallet" pattern) — set after first approveAgent. */
  agentPrivateKey?: `0x${string}`
}

export interface TypedDataDomain {
  name?: string
  version?: string
  chainId?: number
  verifyingContract?: `0x${string}`
  salt?: `0x${string}`
}

export interface VenueError extends Error {
  venue: VenueId
  code?: string                 // venue-native error code
  retryable: boolean
  isReject: boolean             // confirmed venue-side reject
}
