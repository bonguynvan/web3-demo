/**
 * TickEngine — high-performance tick ingestion pipeline.
 *
 * Designed for 1000+ ticks/sec with zero allocation in the hot path.
 *
 * Architecture:
 *   Tick arrives → ring buffer (no alloc) → aggregator updates OHLCV in place
 *   → rAF scheduler reads latest state → flush to store (max 60/s)
 *
 * The key insight: between two animation frames (16.7ms), hundreds of ticks
 * may arrive. We only need the AGGREGATED result (latest candle OHLCV) for
 * rendering. Individual ticks are consumed but not stored.
 *
 * Usage:
 *   const engine = new TickEngine()
 *   engine.start(candleIntervalMs, onFlush)
 *   engine.ingestTick(price, volume, timestamp)  // call 1000+/s
 *   engine.stop()
 */

export interface TickCandle {
  time: number   // bucket start timestamp (ms)
  open: number
  high: number
  low: number
  close: number
  volume: number
  tickCount: number
}

export interface FlushPayload {
  /** Current candle (updated in place every frame) */
  current: TickCandle
  /** True if a new candle started since last flush */
  newCandleStarted: boolean
  /** The completed candle (only set when newCandleStarted is true) */
  completed: TickCandle | null
  /** Latest tick price */
  lastPrice: number
  /** Ticks processed since last flush */
  ticksSinceFlush: number
}

type FlushCallback = (payload: FlushPayload) => void

// Pre-allocated ring buffer for raw tick prices (used for micro-stats if needed)
const RING_SIZE = 2048 // power of 2 for fast modulo
const RING_MASK = RING_SIZE - 1

export class TickEngine {
  // Ring buffer (pre-allocated, zero GC pressure)
  private ringPrices = new Float64Array(RING_SIZE)
  private ringVolumes = new Float64Array(RING_SIZE)
  private ringTimes = new Float64Array(RING_SIZE)
  private ringHead = 0
  private ringCount = 0

  // Current candle being built
  private current: TickCandle = { time: 0, open: 0, high: 0, low: 0, close: 0, volume: 0, tickCount: 0 }
  // Previous completed candle (held for one flush)
  private completed: TickCandle | null = null
  private newCandleFlag = false

  // Config
  private intervalMs = 5000
  private callback: FlushCallback | null = null
  private rafId = 0
  private running = false

  // Stats
  private ticksSinceFlush = 0
  private lastPrice = 0
  public totalTicks = 0
  public flushCount = 0

  /** Start the engine with a candle interval and flush callback */
  start(intervalMs: number, callback: FlushCallback): void {
    this.intervalMs = intervalMs
    this.callback = callback
    this.running = true
    this.totalTicks = 0
    this.flushCount = 0
    this.scheduleFlush()
  }

  stop(): void {
    this.running = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }

  /** Change candle interval (e.g., timeframe switch). Completes current candle. */
  setInterval(intervalMs: number): void {
    if (this.current.tickCount > 0) {
      this.completed = { ...this.current }
      this.newCandleFlag = true
    }
    this.intervalMs = intervalMs
    this.current = { time: 0, open: 0, high: 0, low: 0, close: 0, volume: 0, tickCount: 0 }
  }

  /**
   * Ingest a tick — HOT PATH, called 1000+ times/sec.
   * Zero allocation, no function calls, no React.
   */
  ingestTick(price: number, volume: number = 1, timestamp: number = Date.now()): void {
    this.totalTicks++
    this.ticksSinceFlush++
    this.lastPrice = price

    // Write to ring buffer (overwrites oldest when full)
    const idx = this.ringHead & RING_MASK
    this.ringPrices[idx] = price
    this.ringVolumes[idx] = volume
    this.ringTimes[idx] = timestamp
    this.ringHead++
    if (this.ringCount < RING_SIZE) this.ringCount++

    // Determine candle bucket
    const bucket = Math.floor(timestamp / this.intervalMs) * this.intervalMs

    if (this.current.time === 0 || bucket > this.current.time) {
      // New candle — complete the old one
      if (this.current.tickCount > 0) {
        this.completed = {
          time: this.current.time,
          open: this.current.open,
          high: this.current.high,
          low: this.current.low,
          close: this.current.close,
          volume: this.current.volume,
          tickCount: this.current.tickCount,
        }
        this.newCandleFlag = true
      }
      // Start new candle
      this.current.time = bucket
      this.current.open = price
      this.current.high = price
      this.current.low = price
      this.current.close = price
      this.current.volume = volume
      this.current.tickCount = 1
    } else {
      // Update existing candle — all inline, no function calls
      if (price > this.current.high) this.current.high = price
      if (price < this.current.low) this.current.low = price
      this.current.close = price
      this.current.volume += volume
      this.current.tickCount++
    }
  }

  /** Get recent tick stats (last N ticks from ring buffer) */
  getRecentStats(count: number = 100): { avgPrice: number; minPrice: number; maxPrice: number; tickRate: number } {
    const n = Math.min(count, this.ringCount)
    if (n === 0) return { avgPrice: 0, minPrice: 0, maxPrice: 0, tickRate: 0 }

    let sum = 0, min = Infinity, max = -Infinity
    for (let i = 0; i < n; i++) {
      const idx = ((this.ringHead - 1 - i) & RING_MASK)
      const p = this.ringPrices[idx]
      sum += p
      if (p < min) min = p
      if (p > max) max = p
    }

    // Tick rate: ticks per second based on time range of last N ticks
    const newestTime = this.ringTimes[(this.ringHead - 1) & RING_MASK]
    const oldestTime = this.ringTimes[(this.ringHead - n) & RING_MASK]
    const timeSpanSec = (newestTime - oldestTime) / 1000
    const tickRate = timeSpanSec > 0 ? n / timeSpanSec : 0

    return { avgPrice: sum / n, minPrice: min, maxPrice: max, tickRate }
  }

  // ─── Private ───

  private scheduleFlush(): void {
    this.rafId = requestAnimationFrame(() => {
      if (!this.running) return

      // Flush to callback (max once per frame = 60fps)
      if (this.callback && this.current.tickCount > 0) {
        this.flushCount++
        this.callback({
          current: this.current,
          newCandleStarted: this.newCandleFlag,
          completed: this.completed,
          lastPrice: this.lastPrice,
          ticksSinceFlush: this.ticksSinceFlush,
        })
        this.newCandleFlag = false
        this.completed = null
        this.ticksSinceFlush = 0
      }

      this.scheduleFlush()
    })
  }
}
