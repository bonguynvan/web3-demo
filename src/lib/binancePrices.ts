/**
 * Binance price fetcher — polls real prices for the app state.
 *
 * Uses the lightweight /ticker/price endpoint (single HTTP call for all symbols).
 * The chart uses WebSocket for candles; this is just for header/orderbook/positions.
 */

const API = 'https://api.binance.com/api/v3'

const SYMBOL_MAP: Record<string, string> = {
  'ETH-PERP': 'ETHUSDT',
  'BTC-PERP': 'BTCUSDT',
}

const REVERSE_MAP: Record<string, string> = {
  'ETHUSDT': 'ETH-PERP',
  'BTCUSDT': 'BTC-PERP',
}

export interface BinancePrice {
  symbol: string    // our symbol: "ETH-PERP"
  baseAsset: string // "ETH"
  market: string    // "ETH-PERP"
  price: number
}

let cachedPrices: BinancePrice[] = []
let lastFetch = 0
let fetching = false

/** Fetch current prices from Binance (cached for 1 second) */
export async function fetchBinancePrices(): Promise<BinancePrice[]> {
  const now = Date.now()
  if (now - lastFetch < 1000 && cachedPrices.length > 0) return cachedPrices
  if (fetching) return cachedPrices

  fetching = true
  try {
    const symbols = Object.values(SYMBOL_MAP)
    const url = `${API}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
    const res = await fetch(url)
    if (!res.ok) return cachedPrices

    const data: { symbol: string; price: string }[] = await res.json()
    cachedPrices = data
      .filter(d => REVERSE_MAP[d.symbol])
      .map(d => {
        const market = REVERSE_MAP[d.symbol]
        return {
          symbol: market.split('-')[0], // "ETH"
          baseAsset: market.split('-')[0],
          market,
          price: parseFloat(d.price),
        }
      })
    lastFetch = now
  } catch {
    // Offline — keep cached prices
  } finally {
    fetching = false
  }
  return cachedPrices
}

/** Get the last fetched price (synchronous, from cache) */
export function getCachedBinancePrices(): BinancePrice[] {
  return cachedPrices
}

// ─── 24h ticker stats ───

export interface Binance24hStats {
  market: string
  price: number
  change24h: number      // percentage
  change24hUsd: number   // absolute
  high24h: number
  low24h: number
  volume24h: number
}

let cachedStats: Binance24hStats[] = []
let lastStatsFetch = 0

export async function fetchBinance24hStats(): Promise<Binance24hStats[]> {
  const now = Date.now()
  if (now - lastStatsFetch < 5000 && cachedStats.length > 0) return cachedStats

  try {
    const symbols = Object.values(SYMBOL_MAP)
    const url = `${API}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
    const res = await fetch(url)
    if (!res.ok) return cachedStats

    const data: any[] = await res.json()
    cachedStats = data
      .filter(d => REVERSE_MAP[d.symbol])
      .map(d => {
        const market = REVERSE_MAP[d.symbol]
        const price = parseFloat(d.lastPrice)
        const prevClose = parseFloat(d.prevClosePrice)
        return {
          market,
          price,
          change24h: parseFloat(d.priceChangePercent),
          change24hUsd: price - prevClose,
          high24h: parseFloat(d.highPrice),
          low24h: parseFloat(d.lowPrice),
          volume24h: parseFloat(d.quoteVolume), // USDT volume
        }
      })
    lastStatsFetch = now
  } catch {
    // Keep cached
  }
  return cachedStats
}

export function getCached24hStats(): Binance24hStats[] {
  return cachedStats
}
