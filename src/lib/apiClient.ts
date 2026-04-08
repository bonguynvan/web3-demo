/**
 * REST client for the @perp-dex/server backend.
 *
 * Returns typed envelopes that mirror the server's `ApiResponse<T>` shape:
 *   { success: true, data: T } | { success: false, error: string }
 *
 * The client itself does no caching — callers wrap with useEffect, TanStack
 * Query, or SWR as needed. Errors are surfaced as `success: false` rather
 * than thrown so consumers don't have to wrap every call in try/catch.
 *
 * Base URL comes from `VITE_API_URL` (defaults to localhost:3001 for dev).
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '')

// ─── Response envelope ─────────────────────────────────────────────────────

export type ApiSuccess<T> = { success: true; data: T; meta?: Record<string, unknown> }
export type ApiFailure = { success: false; error: string }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

// ─── Domain types ──────────────────────────────────────────────────────────

export interface MarketDescriptor {
  symbol: string
  baseAsset: string
  indexToken: `0x${string}`
}

export interface MarketStatsDto {
  symbol: string
  baseAsset: string
  indexToken: `0x${string}`
  price: number
  priceTime: number | null
  change24h: number
  change24hUsd: number
  high24h: number
  low24h: number
  volume24h: number
  trades24h: number
}

export interface CandleDto {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type CandleTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

export interface ServerTradeDto {
  id: string
  blockNumber: number
  txHash: string
  eventType: 'increase' | 'decrease' | 'liquidate'
  account: string
  token: string
  indexToken: string
  isLong: boolean
  sizeDelta: number
  collateralDelta: number
  price: number
  fee: number
  timestamp: number
}

export interface UserPositionsDto {
  current: Array<{
    token: string
    isLong: boolean
    size: number
    collateral: number
    averagePrice: number
  }>
  history: Array<{
    eventType: 'increase' | 'decrease' | 'liquidate'
    token: string
    isLong: boolean
    sizeDelta: number
    collateralDelta: number
    price: number
    fee: number
    /**
     * USDC paid back to receiver on close. 0 for opens and liquidations.
     * Use to compute realised PnL: usdcOut - collateralDelta - fee.
     */
    usdcOut: number
    timestamp: number
    txHash: string
  }>
}

// ─── Internal fetch wrapper ────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    })

    // Hono routes return 4xx with the same envelope shape, so try to parse
    // the body even on non-2xx before falling back to a status-code error.
    let body: ApiResponse<T> | null = null
    try {
      body = (await res.json()) as ApiResponse<T>
    } catch {
      /* malformed json — fall through */
    }

    if (body && typeof body === 'object' && 'success' in body) {
      return body
    }

    return { success: false, error: `HTTP ${res.status}` }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export const apiClient = {
  baseUrl: BASE_URL,

  /** Health check — returns true when the server responds. */
  async health(): Promise<boolean> {
    const res = await request<{ ok: boolean }>('/health')
    return res.success && res.data.ok === true
  },

  /** Listed markets. */
  getMarkets(): Promise<ApiResponse<MarketDescriptor[]>> {
    return request<MarketDescriptor[]>('/api/markets')
  },

  /** 24h stats for one market — high/low/volume/change. */
  getMarketStats(symbol: string): Promise<ApiResponse<MarketStatsDto>> {
    return request<MarketStatsDto>(`/api/markets/${encodeURIComponent(symbol)}/stats`)
  },

  /**
   * OHLCV candles aggregated from trade events.
   * Note: only returns buckets that contain at least one fill — gaps are
   * possible on a low-traffic chain.
   */
  getMarketCandles(
    symbol: string,
    opts: { timeframe?: CandleTimeframe; limit?: number; from?: number; to?: number } = {},
  ): Promise<ApiResponse<CandleDto[]>> {
    const params = new URLSearchParams()
    if (opts.timeframe) params.set('timeframe', opts.timeframe)
    if (opts.limit !== undefined) params.set('limit', String(opts.limit))
    if (opts.from !== undefined) params.set('from', String(opts.from))
    if (opts.to !== undefined) params.set('to', String(opts.to))
    const qs = params.toString()
    const path = `/api/markets/${encodeURIComponent(symbol)}/candles${qs ? `?${qs}` : ''}`
    return request<CandleDto[]>(path)
  },

  /**
   * Recent trade fills, optionally filtered by index token.
   * Used to seed the live trade tape on first connect.
   */
  getRecentTrades(opts: { token?: string; limit?: number } = {}): Promise<ApiResponse<ServerTradeDto[]>> {
    const params = new URLSearchParams()
    if (opts.token) params.set('token', opts.token)
    if (opts.limit !== undefined) params.set('limit', String(opts.limit))
    const qs = params.toString()
    return request<ServerTradeDto[]>(`/api/trades${qs ? `?${qs}` : ''}`)
  },

  /** Per-user current positions + indexed history. */
  getUserPositions(address: string): Promise<ApiResponse<UserPositionsDto>> {
    return request<UserPositionsDto>(`/api/positions/${encodeURIComponent(address)}`)
  },
}
