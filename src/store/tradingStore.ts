import { create } from 'zustand'
import type { OrderSide, OrderType, CandleData, Trade } from '../types/trading'
import type { TimeFrame } from '@tradecanvas/chart'

/**
 * Trading store — holds UI state only.
 *
 * On-chain data (positions, prices, balances) comes from hooks
 * (usePositions, usePrices, useUsdcBalance), not from this store.
 *
 * The store retains: order form state, selected market, and candle data.
 */

export interface MarketInfo {
  symbol: string
  baseAsset: string
}

const MARKETS: MarketInfo[] = [
  { symbol: 'ETH-PERP', baseAsset: 'ETH' },
  { symbol: 'BTC-PERP', baseAsset: 'BTC' },
  { symbol: 'SOL-PERP', baseAsset: 'SOL' },
  { symbol: 'ARB-PERP', baseAsset: 'ARB' },
  { symbol: 'DOGE-PERP', baseAsset: 'DOGE' },
  { symbol: 'LINK-PERP', baseAsset: 'LINK' },
  { symbol: 'AVAX-PERP', baseAsset: 'AVAX' },
]

interface TradingState {
  // Market selection
  markets: MarketInfo[]
  selectedMarket: MarketInfo
  setSelectedMarket: (symbol: string) => void

  // Timeframe
  timeframe: TimeFrame
  setTimeframe: (tf: TimeFrame) => void

  // Candles (fed by price hook or backend API)
  candles: CandleData[]
  addCandle: (candle: CandleData) => void
  setCandles: (candles: CandleData[]) => void

  // Recent trades (fed by backend WebSocket or indexer)
  recentTrades: Trade[]
  addTrade: (trade: Trade) => void

  // Order form
  orderSide: OrderSide
  orderType: OrderType
  leverage: number
  orderPrice: string
  orderSize: string
  setOrderSide: (side: OrderSide) => void
  setOrderType: (type: OrderType) => void
  setLeverage: (leverage: number) => void
  setOrderPrice: (price: string) => void
  setOrderSize: (size: string) => void
}

export const useTradingStore = create<TradingState>((set) => ({
  // Market selection
  markets: MARKETS,
  selectedMarket: MARKETS[0],
  setSelectedMarket: (symbol: string) => {
    const market = MARKETS.find(m => m.symbol === symbol)
    if (market) {
      set({ selectedMarket: market, candles: [], orderPrice: '' })
    }
  },

  // Timeframe
  timeframe: '5m' as TimeFrame,
  setTimeframe: (tf: TimeFrame) => set({ timeframe: tf, candles: [] }),

  // Candles
  candles: [],
  addCandle: (candle) => {
    set(state => ({ candles: [...state.candles.slice(-499), candle] }))
  },
  setCandles: (candles) => set({ candles }),

  // Recent trades
  recentTrades: [],
  addTrade: (trade) => {
    set(state => ({ recentTrades: [trade, ...state.recentTrades.slice(0, 49)] }))
  },

  // Order form
  orderSide: 'long',
  orderType: 'market',
  leverage: 10,
  orderPrice: '',
  orderSize: '',
  setOrderSide: (side) => set({ orderSide: side }),
  setOrderType: (type) => set({ orderType: type }),
  setLeverage: (leverage) => set({ leverage }),
  setOrderPrice: (price) => set({ orderPrice: price }),
  setOrderSize: (size) => set({ orderSize: size }),
}))
