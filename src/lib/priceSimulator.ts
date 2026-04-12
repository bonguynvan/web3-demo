/**
 * PriceSimulator — generates realistic price ticks for N trading pairs.
 *
 * Runs a single setInterval that produces ticks for all pairs each cycle.
 * Each pair has independent volatility, drift, and momentum.
 *
 * Performance: generates ticks in a tight loop, no allocations per tick.
 * The consumer batches updates via requestAnimationFrame.
 */

export interface SimPair {
  symbol: string
  baseAsset: string
  price: number
  volatility: number // daily vol as fraction, e.g. 0.05 = 5%
}

export interface PriceTick {
  symbol: string
  price: number
  size: number
  side: 'long' | 'short'
  time: number
}

export interface SimulatorConfig {
  /** Tick interval in ms (default 10 = 100 ticks/sec) */
  intervalMs: number
  /** How many pairs to tick per interval (default: all) */
  pairsPerTick?: number
}

const DEFAULT_PAIRS: SimPair[] = [
  { symbol: 'ETH-PERP', baseAsset: 'ETH', price: 3450, volatility: 0.04 },
  { symbol: 'BTC-PERP', baseAsset: 'BTC', price: 68500, volatility: 0.035 },
  { symbol: 'SOL-PERP', baseAsset: 'SOL', price: 178, volatility: 0.06 },
  { symbol: 'ARB-PERP', baseAsset: 'ARB', price: 1.12, volatility: 0.07 },
  { symbol: 'DOGE-PERP', baseAsset: 'DOGE', price: 0.165, volatility: 0.08 },
  { symbol: 'LINK-PERP', baseAsset: 'LINK', price: 14.8, volatility: 0.05 },
  { symbol: 'AVAX-PERP', baseAsset: 'AVAX', price: 38.5, volatility: 0.055 },
]

// Extra pairs for stress testing
const STRESS_PAIRS: SimPair[] = [
  { symbol: 'SOL-PERP', baseAsset: 'SOL', price: 178, volatility: 0.06 },
  { symbol: 'ARB-PERP', baseAsset: 'ARB', price: 1.12, volatility: 0.07 },
  { symbol: 'AVAX-PERP', baseAsset: 'AVAX', price: 38.5, volatility: 0.055 },
  { symbol: 'DOGE-PERP', baseAsset: 'DOGE', price: 0.165, volatility: 0.08 },
  { symbol: 'LINK-PERP', baseAsset: 'LINK', price: 14.8, volatility: 0.05 },
  { symbol: 'MATIC-PERP', baseAsset: 'MATIC', price: 0.72, volatility: 0.065 },
  { symbol: 'OP-PERP', baseAsset: 'OP', price: 2.45, volatility: 0.07 },
  { symbol: 'ATOM-PERP', baseAsset: 'ATOM', price: 9.2, volatility: 0.055 },
  { symbol: 'UNI-PERP', baseAsset: 'UNI', price: 7.8, volatility: 0.06 },
  { symbol: 'AAVE-PERP', baseAsset: 'AAVE', price: 92, volatility: 0.05 },
  { symbol: 'MKR-PERP', baseAsset: 'MKR', price: 1450, volatility: 0.045 },
  { symbol: 'FIL-PERP', baseAsset: 'FIL', price: 5.6, volatility: 0.07 },
  { symbol: 'APT-PERP', baseAsset: 'APT', price: 8.9, volatility: 0.065 },
  { symbol: 'INJ-PERP', baseAsset: 'INJ', price: 24.5, volatility: 0.08 },
  { symbol: 'SUI-PERP', baseAsset: 'SUI', price: 1.35, volatility: 0.09 },
  { symbol: 'TIA-PERP', baseAsset: 'TIA', price: 11.2, volatility: 0.08 },
  { symbol: 'SEI-PERP', baseAsset: 'SEI', price: 0.52, volatility: 0.085 },
  { symbol: 'NEAR-PERP', baseAsset: 'NEAR', price: 5.1, volatility: 0.06 },
  { symbol: 'RUNE-PERP', baseAsset: 'RUNE', price: 4.8, volatility: 0.07 },
  { symbol: 'WLD-PERP', baseAsset: 'WLD', price: 2.3, volatility: 0.09 },
  { symbol: 'PEPE-PERP', baseAsset: 'PEPE', price: 0.0000089, volatility: 0.12 },
  { symbol: 'WIF-PERP', baseAsset: 'WIF', price: 1.85, volatility: 0.11 },
  { symbol: 'JUP-PERP', baseAsset: 'JUP', price: 0.95, volatility: 0.08 },
  { symbol: 'PENDLE-PERP', baseAsset: 'PENDLE', price: 5.4, volatility: 0.07 },
  { symbol: 'STX-PERP', baseAsset: 'STX', price: 2.1, volatility: 0.065 },
  { symbol: 'IMX-PERP', baseAsset: 'IMX', price: 2.2, volatility: 0.07 },
  { symbol: 'FET-PERP', baseAsset: 'FET', price: 2.15, volatility: 0.08 },
  { symbol: 'RNDR-PERP', baseAsset: 'RNDR', price: 8.4, volatility: 0.075 },
]

export function buildPairList(count: number): SimPair[] {
  const all = [...DEFAULT_PAIRS, ...STRESS_PAIRS]
  if (count <= all.length) return all.slice(0, count)
  // Generate synthetic pairs beyond the predefined list
  const result = [...all]
  for (let i = all.length; i < count; i++) {
    result.push({
      symbol: `SYN${i}-PERP`,
      baseAsset: `SYN${i}`,
      price: 10 + Math.random() * 1000,
      volatility: 0.04 + Math.random() * 0.08,
    })
  }
  return result
}

interface PairState {
  price: number
  momentum: number // mean-reverting drift
}

export type TickCallback = (ticks: PriceTick[]) => void

export class PriceSimulator {
  private pairs: SimPair[]
  private states: Map<string, PairState> = new Map()
  private interval: ReturnType<typeof setInterval> | null = null
  private callback: TickCallback | null = null
  private config: SimulatorConfig

  // Stats
  tickCount = 0
  private lastStatReset = Date.now()

  constructor(pairs: SimPair[], config: SimulatorConfig) {
    this.pairs = pairs
    this.config = config

    for (const p of pairs) {
      this.states.set(p.symbol, {
        price: p.price,
        momentum: 0,
      })
    }
  }

  onTick(cb: TickCallback): void {
    this.callback = cb
  }

  start(): void {
    if (this.interval) return
    this.lastStatReset = Date.now()
    this.tickCount = 0

    this.interval = setInterval(() => {
      const ticks: PriceTick[] = []
      const now = Date.now()
      const dt = this.config.intervalMs / 1000 // seconds

      // How many pairs to update this cycle
      const count = this.config.pairsPerTick ?? this.pairs.length

      for (let i = 0; i < count && i < this.pairs.length; i++) {
        const pair = this.pairs[i]
        const state = this.states.get(pair.symbol)!

        // Geometric Brownian Motion with mean-reverting momentum
        const dailyVol = pair.volatility
        const sigma = dailyVol / Math.sqrt(86400 / dt) // scale to tick interval
        const noise = gaussianRandom() * sigma
        state.momentum = state.momentum * 0.98 + noise * 0.02 // slow drift
        const ret = state.momentum + noise
        state.price *= (1 + ret)

        // Clamp to prevent degenerate prices
        state.price = Math.max(state.price, pair.price * 0.5)
        state.price = Math.min(state.price, pair.price * 1.5)

        const side = ret >= 0 ? 'long' : 'short' as const
        ticks.push({
          symbol: pair.symbol,
          price: state.price,
          size: Math.random() * 10 + 0.01,
          side,
          time: now,
        })
      }

      this.tickCount += ticks.length
      this.callback?.(ticks)
    }, this.config.intervalMs)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  /** Ticks per second (averaged) */
  getTicksPerSecond(): number {
    const elapsed = (Date.now() - this.lastStatReset) / 1000
    return elapsed > 0 ? this.tickCount / elapsed : 0
  }

  resetStats(): void {
    this.tickCount = 0
    this.lastStatReset = Date.now()
  }

  getPrice(symbol: string): number {
    return this.states.get(symbol)?.price ?? 0
  }

  getPairs(): SimPair[] {
    return this.pairs
  }

  isRunning(): boolean {
    return this.interval !== null
  }

  destroy(): void {
    this.stop()
    this.callback = null
  }
}

// Box-Muller transform for Gaussian random numbers
function gaussianRandom(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}
