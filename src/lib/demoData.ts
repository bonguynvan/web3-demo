/**
 * Demo data generators — provides realistic fake data for demo mode.
 * All hooks use these when mode === 'demo'.
 */

import type { Trade } from '../types/trading'

// ─── Demo account ───

export const DEMO_ACCOUNT = {
  address: '0xDe7o...Ac3t' as const,
  balance: 100_000,       // USDC
  plpBalance: 0,
}

// ─── Demo prices (updated by simulation) ───

export interface DemoPrice {
  symbol: string
  market: string
  price: number
  raw: bigint
}

const PRICE_PRECISION = 10n ** 30n

let ethPrice = 3480 + Math.random() * 40
let btcPrice = 68200 + Math.random() * 600

export function getDemoPrices(): DemoPrice[] {
  return [
    { symbol: 'ETH', market: 'ETH-PERP', price: ethPrice, raw: BigInt(Math.round(ethPrice * 1e6)) * (PRICE_PRECISION / 10n ** 6n) },
    { symbol: 'BTC', market: 'BTC-PERP', price: btcPrice, raw: BigInt(Math.round(btcPrice * 1e6)) * (PRICE_PRECISION / 10n ** 6n) },
  ]
}

export function tickDemoPrices(): DemoPrice[] {
  const ethVol = ethPrice * 0.0003
  const btcVol = btcPrice * 0.0003
  ethPrice += (Math.random() - 0.48) * ethVol
  btcPrice += (Math.random() - 0.48) * btcVol
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
  // Update PnL with current prices
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

export function addDemoPosition(pos: Omit<DemoPosition, 'pnl' | 'pnlPercent' | 'markPrice'>) {
  demoPositions.push({ ...pos, markPrice: pos.entryPrice, pnl: 0, pnlPercent: 0 })
}

export function removeDemoPosition(key: string) {
  const idx = demoPositions.findIndex(p => p.key === key)
  if (idx >= 0) demoPositions.splice(idx, 1)
}

export function closeDemoPosition(key: string, closePct: number): { realizedPnl: number } | null {
  const pos = demoPositions.find(p => p.key === key)
  if (!pos) return null

  const realizedPnl = pos.pnl * (closePct / 100)

  if (closePct >= 100) {
    removeDemoPosition(key)
  } else {
    pos.size *= (1 - closePct / 100)
    pos.collateral *= (1 - closePct / 100)
    pos.sizeRaw = BigInt(Math.round(pos.size * 1e6)) * (PRICE_PRECISION / 10n ** 6n)
    pos.collateralRaw = BigInt(Math.round(pos.collateral * 1e6)) * (PRICE_PRECISION / 10n ** 6n)
  }

  return { realizedPnl }
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
