import type { Market, OrderBookData, Position, Trade, CandleData } from '../types/trading'

const BASE_PRICE = 3245.67

export const MARKETS: Market[] = [
  {
    symbol: 'ETH-PERP',
    baseAsset: 'ETH',
    quoteAsset: 'USD',
    lastPrice: BASE_PRICE,
    change24h: 2.34,
    high24h: 3312.45,
    low24h: 3178.22,
    volume24h: 847_234_567,
    fundingRate: 0.0042,
    nextFunding: 3247,
    markPrice: 3245.89,
    indexPrice: 3245.12,
  },
  {
    symbol: 'BTC-PERP',
    baseAsset: 'BTC',
    quoteAsset: 'USD',
    lastPrice: 84_521.34,
    change24h: -0.87,
    high24h: 86_123.45,
    low24h: 83_456.78,
    volume24h: 2_345_678_901,
    fundingRate: 0.0018,
    nextFunding: 3247,
    markPrice: 84_523.12,
    indexPrice: 84_519.56,
  },
  {
    symbol: 'SOL-PERP',
    baseAsset: 'SOL',
    quoteAsset: 'USD',
    lastPrice: 134.56,
    change24h: 5.12,
    high24h: 138.90,
    low24h: 127.34,
    volume24h: 567_890_123,
    fundingRate: 0.0067,
    nextFunding: 3247,
    markPrice: 134.58,
    indexPrice: 134.52,
  },
  {
    symbol: 'ARB-PERP',
    baseAsset: 'ARB',
    quoteAsset: 'USD',
    lastPrice: 0.8234,
    change24h: -3.45,
    high24h: 0.8678,
    low24h: 0.8012,
    volume24h: 123_456_789,
    fundingRate: -0.0023,
    nextFunding: 3247,
    markPrice: 0.8236,
    indexPrice: 0.8232,
  },
]

export function generateOrderBook(midPrice: number): OrderBookData {
  const asks: { price: number; size: number; total: number }[] = []
  const bids: { price: number; size: number; total: number }[] = []

  let askTotal = 0
  let bidTotal = 0
  const tickSize = midPrice > 1000 ? 0.01 : midPrice > 10 ? 0.001 : 0.0001

  for (let i = 0; i < 20; i++) {
    const askSize = +(Math.random() * 50 + 1).toFixed(3)
    askTotal += askSize
    asks.push({
      price: +(midPrice + (i + 1) * tickSize * (1 + Math.random() * 2)).toFixed(2),
      size: askSize,
      total: +askTotal.toFixed(3),
    })

    const bidSize = +(Math.random() * 50 + 1).toFixed(3)
    bidTotal += bidSize
    bids.push({
      price: +(midPrice - (i + 1) * tickSize * (1 + Math.random() * 2)).toFixed(2),
      size: bidSize,
      total: +bidTotal.toFixed(3),
    })
  }

  const spread = asks[0].price - bids[0].price
  return {
    asks,
    bids,
    spread: +spread.toFixed(2),
    spreadPercent: +((spread / midPrice) * 100).toFixed(4),
  }
}

export function generatePositions(): Position[] {
  return [
    {
      id: '1',
      market: 'ETH-PERP',
      side: 'long',
      size: 5.2,
      entryPrice: 3198.45,
      markPrice: 3245.89,
      leverage: 10,
      liquidationPrice: 2918.60,
      unrealizedPnl: 246.69,
      unrealizedPnlPercent: 14.83,
      margin: 1663.19,
    },
    {
      id: '2',
      market: 'BTC-PERP',
      side: 'short',
      size: 0.15,
      entryPrice: 85_234.56,
      markPrice: 84_523.12,
      leverage: 5,
      liquidationPrice: 102_281.47,
      unrealizedPnl: 106.72,
      unrealizedPnlPercent: 8.35,
      margin: 2557.04,
    },
    {
      id: '3',
      market: 'SOL-PERP',
      side: 'long',
      size: 120,
      entryPrice: 138.90,
      markPrice: 134.58,
      leverage: 3,
      liquidationPrice: 92.60,
      unrealizedPnl: -518.40,
      unrealizedPnlPercent: -3.11,
      margin: 5556.00,
    },
  ]
}

export function generateRecentTrades(basePrice: number): Trade[] {
  const trades: Trade[] = []
  let now = Date.now()

  for (let i = 0; i < 50; i++) {
    const side = Math.random() > 0.5 ? 'long' : 'short' as const
    trades.push({
      id: `t-${i}`,
      price: +(basePrice + (Math.random() - 0.5) * basePrice * 0.002).toFixed(2),
      size: +(Math.random() * 10 + 0.01).toFixed(3),
      side,
      time: now - i * (Math.random() * 3000 + 500),
    })
  }
  return trades
}

export function generateCandles(basePrice: number, count: number = 200): CandleData[] {
  const candles: CandleData[] = []
  let price = basePrice * 0.92
  const now = Math.floor(Date.now() / 1000)
  const interval = 300 // 5 min candles

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * price * 0.008
    const open = price
    const close = price + change
    const high = Math.max(open, close) + Math.random() * price * 0.003
    const low = Math.min(open, close) - Math.random() * price * 0.003
    price = close

    candles.push({
      time: now - (count - i) * interval,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: +(Math.random() * 1000 + 100).toFixed(0),
    })
  }
  return candles
}
