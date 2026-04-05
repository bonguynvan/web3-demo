import { create } from 'zustand'
import type { Market, OrderBookData, Position, Trade, CandleData, OrderSide, OrderType } from '../types/trading'
import {
  MARKETS,
  generateOrderBook,
  generatePositions,
  generateRecentTrades,
  generateCandles,
} from '../lib/mockData'

interface TradingState {
  // Market
  markets: Market[]
  selectedMarket: Market
  setSelectedMarket: (symbol: string) => void

  // Orderbook
  orderBook: OrderBookData
  updateOrderBook: () => void

  // Positions
  positions: Position[]

  // Trades
  recentTrades: Trade[]

  // Candles
  candles: CandleData[]
  addCandle: (candle: CandleData) => void

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

  // Account
  accountBalance: number
  walletConnected: boolean
  connectWallet: () => void

  // Simulation
  tickPrice: () => void
}

export const useTradingStore = create<TradingState>((set, get) => ({
  // Market
  markets: MARKETS,
  selectedMarket: MARKETS[0],
  setSelectedMarket: (symbol: string) => {
    const market = MARKETS.find(m => m.symbol === symbol)
    if (market) {
      set({
        selectedMarket: market,
        orderBook: generateOrderBook(market.lastPrice),
        recentTrades: generateRecentTrades(market.lastPrice),
        candles: generateCandles(market.lastPrice),
        orderPrice: market.lastPrice.toFixed(2),
      })
    }
  },

  // Orderbook
  orderBook: generateOrderBook(MARKETS[0].lastPrice),
  updateOrderBook: () => {
    const { selectedMarket } = get()
    set({ orderBook: generateOrderBook(selectedMarket.lastPrice) })
  },

  // Positions
  positions: generatePositions(),

  // Trades
  recentTrades: generateRecentTrades(MARKETS[0].lastPrice),

  // Candles
  candles: generateCandles(MARKETS[0].lastPrice),
  addCandle: (candle) => {
    set(state => ({ candles: [...state.candles.slice(1), candle] }))
  },

  // Order form
  orderSide: 'long',
  orderType: 'limit',
  leverage: 10,
  orderPrice: MARKETS[0].lastPrice.toFixed(2),
  orderSize: '',
  setOrderSide: (side) => set({ orderSide: side }),
  setOrderType: (type) => set({ orderType: type }),
  setLeverage: (leverage) => set({ leverage }),
  setOrderPrice: (price) => set({ orderPrice: price }),
  setOrderSize: (size) => set({ orderSize: size }),

  // Account
  accountBalance: 12_456.78,
  walletConnected: false,
  connectWallet: () => set({ walletConnected: true }),

  // Simulation: tick the price slightly
  tickPrice: () => {
    const { selectedMarket, positions } = get()
    const delta = (Math.random() - 0.48) * selectedMarket.lastPrice * 0.0003
    const newPrice = +(selectedMarket.lastPrice + delta).toFixed(2)
    const newMark = +(newPrice + (Math.random() - 0.5) * 0.5).toFixed(2)

    const updatedMarket = {
      ...selectedMarket,
      lastPrice: newPrice,
      markPrice: newMark,
      change24h: +(selectedMarket.change24h + (Math.random() - 0.5) * 0.02).toFixed(2),
    }

    // Update positions PnL
    const updatedPositions = positions.map(p => {
      if (p.market === selectedMarket.symbol) {
        const priceDiff = p.side === 'long'
          ? newMark - p.entryPrice
          : p.entryPrice - newMark
        const pnl = +(priceDiff * p.size).toFixed(2)
        const pnlPercent = +((pnl / p.margin) * 100).toFixed(2)
        return { ...p, markPrice: newMark, unrealizedPnl: pnl, unrealizedPnlPercent: pnlPercent }
      }
      return p
    })

    // Add new trade
    const newTrade: Trade = {
      id: `t-${Date.now()}`,
      price: newPrice,
      size: +(Math.random() * 5 + 0.1).toFixed(3),
      side: delta > 0 ? 'long' : 'short',
      time: Date.now(),
    }

    set(state => ({
      selectedMarket: updatedMarket,
      markets: state.markets.map(m => m.symbol === updatedMarket.symbol ? updatedMarket : m),
      positions: updatedPositions,
      recentTrades: [newTrade, ...state.recentTrades.slice(0, 49)],
      orderBook: generateOrderBook(newPrice),
    }))
  },
}))
