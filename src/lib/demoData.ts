/**
 * Demo data — mutable state for demo mode.
 *
 * All state lives here as plain JS (not React state) so it can be read
 * from any hook. Hooks poll this data on intervals to trigger re-renders.
 */

import type { Trade } from '../types/trading'

const PRICE_PRECISION = 10n ** 30n

// ─── Demo account (mutable balance) ───

export const DEMO_ACCOUNT = {
  address: '0xDe7o...Ac3t' as const,
  initialBalance: 100_000,
  balance: 100_000,
  plpBalance: 0,
}

export function resetDemoAccount() {
  DEMO_ACCOUNT.balance = DEMO_ACCOUNT.initialBalance
  demoPositions.length = 0
  demoOrders.length = 0
  demoHistory.length = 0
}

// ─── Demo prices ───

export interface DemoPrice {
  symbol: string
  market: string
  price: number
  raw: bigint
}

let ethPrice = 3480 + Math.random() * 40
let btcPrice = 68200 + Math.random() * 600

function toRaw(price: number): bigint {
  return BigInt(Math.round(price * 1e6)) * (PRICE_PRECISION / 10n ** 6n)
}

export function getDemoPrices(): DemoPrice[] {
  return [
    { symbol: 'ETH', market: 'ETH-PERP', price: ethPrice, raw: toRaw(ethPrice) },
    { symbol: 'BTC', market: 'BTC-PERP', price: btcPrice, raw: toRaw(btcPrice) },
  ]
}

export function tickDemoPrices(): DemoPrice[] {
  ethPrice += (Math.random() - 0.48) * ethPrice * 0.0003
  btcPrice += (Math.random() - 0.48) * btcPrice * 0.0003
  return getDemoPrices()
}

// ─── Demo positions ───

export interface DemoPosition {
  key: string
  market: string
  baseAsset: string
  indexToken: `0x${string}`
  side: 'long' | 'short'
  size: number
  sizeRaw: bigint
  collateral: number
  collateralRaw: bigint
  entryPrice: number
  entryPriceRaw: bigint
  markPrice: number
  leverage: string
  pnl: number
  pnlPercent: number
  liquidationPrice: number
}

const demoPositions: DemoPosition[] = []

export function getDemoPositions(prices: DemoPrice[]): DemoPosition[] {
  for (const pos of demoPositions) {
    const price = prices.find(p => p.market === pos.market)
    if (price) {
      pos.markPrice = price.price
      const priceDelta = pos.side === 'long'
        ? (price.price - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - price.price) / pos.entryPrice
      pos.pnl = priceDelta * pos.size
      pos.pnlPercent = pos.collateral > 0 ? (pos.pnl / pos.collateral) * 100 : 0
    }
  }
  return [...demoPositions]
}

export function addDemoPosition(pos: Omit<DemoPosition, 'pnl' | 'pnlPercent' | 'markPrice'> & { tp?: number; sl?: number }) {
  // Deduct collateral from balance
  DEMO_ACCOUNT.balance -= pos.collateral

  demoPositions.push({ ...pos, markPrice: pos.entryPrice, pnl: 0, pnlPercent: 0 })

  // Add TP/SL orders if provided
  if (pos.tp && pos.tp > 0) {
    demoOrders.push({
      id: `o-${Date.now()}-tp`,
      market: pos.market,
      side: pos.side,
      type: 'Take Profit',
      triggerPrice: pos.tp,
      size: pos.size,
      positionKey: pos.key,
      createdAt: Date.now(),
    })
  }
  if (pos.sl && pos.sl > 0) {
    demoOrders.push({
      id: `o-${Date.now()}-sl`,
      market: pos.market,
      side: pos.side,
      type: 'Stop Loss',
      triggerPrice: pos.sl,
      size: pos.size,
      positionKey: pos.key,
      createdAt: Date.now(),
    })
  }
}

export function closeDemoPosition(key: string, closePct: number): { realizedPnl: number } | null {
  const pos = demoPositions.find(p => p.key === key)
  if (!pos) return null

  const realizedPnl = pos.pnl * (closePct / 100)
  const closedSize = pos.size * (closePct / 100)
  const returnedCollateral = pos.collateral * (closePct / 100)

  // Return collateral + PnL to balance
  DEMO_ACCOUNT.balance += returnedCollateral + realizedPnl

  // Add to trade history
  demoHistory.unshift({
    id: `h-${Date.now()}`,
    market: pos.market,
    side: pos.side,
    action: 'Close',
    size: closedSize,
    entryPrice: pos.entryPrice,
    closePrice: pos.markPrice,
    realizedPnl,
    fee: closedSize * 0.001,
    time: Date.now(),
  })

  if (closePct >= 100) {
    // Remove position and associated orders
    const idx = demoPositions.findIndex(p => p.key === key)
    if (idx >= 0) demoPositions.splice(idx, 1)
    // Remove TP/SL orders for this position
    for (let i = demoOrders.length - 1; i >= 0; i--) {
      if (demoOrders[i].positionKey === key) demoOrders.splice(i, 1)
    }
  } else {
    pos.size *= (1 - closePct / 100)
    pos.collateral *= (1 - closePct / 100)
    pos.sizeRaw = toRaw(pos.size)
    pos.collateralRaw = toRaw(pos.collateral)
  }

  return { realizedPnl }
}

// ─── Demo orders (TP/SL) ───

export interface DemoOrder {
  id: string
  market: string
  side: 'long' | 'short'
  type: 'Take Profit' | 'Stop Loss'
  triggerPrice: number
  size: number
  positionKey: string
  createdAt: number
}

const demoOrders: DemoOrder[] = []

export function getDemoOrders(): DemoOrder[] {
  return [...demoOrders]
}

export function cancelDemoOrder(id: string) {
  const idx = demoOrders.findIndex(o => o.id === id)
  if (idx >= 0) demoOrders.splice(idx, 1)
}

// ─── Demo trade history ───

export interface DemoTradeHistory {
  id: string
  market: string
  side: 'long' | 'short'
  action: 'Open' | 'Close' | 'Liquidated'
  size: number
  entryPrice: number
  closePrice: number
  realizedPnl: number
  fee: number
  time: number
}

const demoHistory: DemoTradeHistory[] = []

export function getDemoHistory(): DemoTradeHistory[] {
  return [...demoHistory]
}

// ─── Demo vault stats ───

export function getDemoVaultStats() {
  return {
    poolAmount: 2_500_000,
    reservedAmount: 450_000,
    availableLiquidity: 2_050_000,
    aum: 2_500_000,
    utilizationPercent: 18,
  }
}

// ─── Demo trade generator ───

let tradeId = 0

export function generateDemoTrade(prices: DemoPrice[], market: string): Trade | null {
  const price = prices.find(p => p.market === market)
  if (!price) return null

  const spreadNoise = price.price * (Math.random() - 0.5) * 0.0002
  const r = Math.random()
  const size = r < 0.6 ? 0.01 + Math.random() * 0.5
    : r < 0.9 ? 0.5 + Math.random() * 5
    : r < 0.98 ? 5 + Math.random() * 20
    : 20 + Math.random() * 100

  return {
    id: `dt-${++tradeId}`,
    price: +(price.price + spreadNoise).toFixed(2),
    size: +size.toFixed(4),
    side: Math.random() > 0.45 ? 'long' : 'short',
    time: Date.now(),
  }
}
