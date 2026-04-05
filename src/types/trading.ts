export interface Market {
  symbol: string
  baseAsset: string
  quoteAsset: string
  lastPrice: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
  fundingRate: number
  nextFunding: number // seconds until next funding
  markPrice: number
  indexPrice: number
}

export interface OrderBookEntry {
  price: number
  size: number
  total: number
}

export interface OrderBookData {
  asks: OrderBookEntry[]
  bids: OrderBookEntry[]
  spread: number
  spreadPercent: number
}

export type OrderSide = 'long' | 'short'
export type OrderType = 'market' | 'limit'

export interface Position {
  id: string
  market: string
  side: OrderSide
  size: number
  entryPrice: number
  markPrice: number
  leverage: number
  liquidationPrice: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  margin: number
}

export interface Trade {
  id: string
  price: number
  size: number
  side: OrderSide
  time: number
}

export interface CandleData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}
