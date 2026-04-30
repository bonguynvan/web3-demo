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

// Seed list — keeps selectedMarket non-null on first render before
// useSyncMarkets replaces this with the active venue's real list.
const SEED_MARKETS: MarketInfo[] = [
  { symbol: 'ETH-PERP', baseAsset: 'ETH' },
  { symbol: 'BTC-PERP', baseAsset: 'BTC' },
]

interface TradingState {
  // Market selection
  markets: MarketInfo[]
  selectedMarket: MarketInfo
  setSelectedMarket: (symbol: string) => void
  setMarkets: (markets: MarketInfo[]) => void

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

export const useTradingStore = create<TradingState>((set, get) => ({
  // Market selection
  markets: SEED_MARKETS,
  selectedMarket: SEED_MARKETS[0],
  setSelectedMarket: (symbol: string) => {
    const market = get().markets.find(m => m.symbol === symbol)
    if (market) {
      set({ selectedMarket: market, candles: [], orderPrice: '' })
    }
  },
  setMarkets: (markets: MarketInfo[]) => {
    if (markets.length === 0) return
    set(state => {
      // Preserve selection by baseAsset across venue switches — venues
      // use different id formats (e.g. "BTC/USDT" on Binance spot vs
      // "BTC-PERP" on Hyperliquid perps), so matching by full symbol
      // would always reset to the first market.
      const sameBase = markets.find(m => m.baseAsset === state.selectedMarket.baseAsset)
      const sameSymbol = markets.find(m => m.symbol === state.selectedMarket.symbol)
      return {
        markets,
        selectedMarket: sameSymbol ?? sameBase ?? markets[0],
      }
    })
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
