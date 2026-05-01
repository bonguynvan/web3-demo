/**
 * Backtest engine — replay a BotConfig against historical candles.
 *
 * Walks bars chronologically, computes the same TA signals our live
 * engine would have seen at each point, applies the bot filter, opens
 * a virtual trade on match, and closes it at the configured hold
 * window (or earlier if an opposing confluence signal fires).
 *
 * Scope (v1):
 *   - Single-market candle-driven sources only: crossover, rsi,
 *     volatility, plus confluence over those three.
 *   - Funding and whale-flow sources are skipped — they need
 *     historical ticker / trade streams which we don't replay.
 *   - Position-aware: only one open trade per bot at a time.
 */

import {
  crossoverSignals,
  rsiSignals,
  volatilitySignals,
  confluenceSignals,
} from '../signals/compute'
import type { BotConfig } from './types'
import type { Signal } from '../signals/types'
import type { CandleData } from '../types/trading'

const WARMUP_BARS = 30   // need enough history for slow EMA + RSI + vol baseline
const REVERSAL_MIN_HOLD_MS = 2 * 60_000

export interface BacktestTrade {
  id: string
  signalId: string
  signalSource: string
  direction: 'long' | 'short'
  entryPrice: number
  closePrice: number
  size: number
  pnlUsd: number
  openedAtIdx: number
  closedAtIdx: number
  openedAtTime: number
  closedAtTime: number
  closeReason: 'hold-expired' | 'opposing-confluence'
}

export interface BacktestResult {
  trades: BacktestTrade[]
  totalPnlUsd: number
  winRate: number
  wins: number
  losses: number
  maxDrawdownUsd: number
  /** Realized equity curve — y values per closed trade in chronological order */
  equityCurve: number[]
  candleCount: number
  windowStart: number
  windowEnd: number
}

export function runBacktest(
  config: BotConfig,
  marketId: string,
  candles: CandleData[],
): BacktestResult {
  if (candles.length < WARMUP_BARS) {
    return emptyResult(candles)
  }

  const venue = 'hyperliquid'  // venue tag does not affect TA math
  const trades: BacktestTrade[] = []
  let openTrade: { signal: Signal; idx: number; closeAtTime: number } | null = null

  for (let i = WARMUP_BARS; i < candles.length; i++) {
    const window = candles.slice(0, i + 1)
    const now = candles[i].time

    const ta: Signal[] = [
      ...crossoverSignals(venue, marketId, window, 9, 21, now),
      ...rsiSignals(venue, marketId, window, now),
      ...volatilitySignals(venue, marketId, window, now),
    ]
    const conf = confluenceSignals(ta, now)
    const allSignals = [...conf, ...ta]

    if (openTrade) {
      const heldFor = now - openTrade.signal.triggeredAt
      const opposing = conf.find(s =>
        s.direction !== openTrade!.signal.direction &&
        s.confidence >= 0.7,
      )
      if (heldFor >= REVERSAL_MIN_HOLD_MS && opposing) {
        trades.push(closeAt(openTrade, candles, i, 'opposing-confluence', config))
        openTrade = null
      } else if (now >= openTrade.closeAtTime) {
        trades.push(closeAt(openTrade, candles, i, 'hold-expired', config))
        openTrade = null
      }
    }

    if (!openTrade) {
      for (const s of allSignals) {
        if (!matchesFilter(config, s)) continue
        const entryPrice = s.suggestedPrice ?? candles[i].close
        if (!Number.isFinite(entryPrice) || entryPrice <= 0) continue
        openTrade = {
          signal: s,
          idx: i,
          closeAtTime: now + config.holdMinutes * 60_000,
        }
        break
      }
    }
  }

  if (openTrade) {
    trades.push(closeAt(openTrade, candles, candles.length - 1, 'hold-expired', config))
  }

  let totalPnl = 0
  let wins = 0
  let losses = 0
  let peak = 0
  let cum = 0
  let maxDd = 0
  const equity: number[] = []

  for (const t of trades) {
    cum += t.pnlUsd
    equity.push(cum)
    totalPnl += t.pnlUsd
    if (t.pnlUsd >= 0) wins++; else losses++
    if (cum > peak) peak = cum
    const dd = peak - cum
    if (dd > maxDd) maxDd = dd
  }

  return {
    trades,
    totalPnlUsd: totalPnl,
    wins,
    losses,
    winRate: trades.length > 0 ? wins / trades.length : 0,
    maxDrawdownUsd: maxDd,
    equityCurve: equity,
    candleCount: candles.length,
    windowStart: candles[0]?.time ?? 0,
    windowEnd: candles[candles.length - 1]?.time ?? 0,
  }
}

function matchesFilter(config: BotConfig, signal: Signal): boolean {
  if (signal.confidence < config.minConfidence) return false
  if (config.allowedSources.length > 0 && !config.allowedSources.includes(signal.source)) return false
  if (config.allowedMarkets.length > 0 && !config.allowedMarkets.includes(signal.marketId)) return false
  return true
}

function closeAt(
  open: { signal: Signal; idx: number; closeAtTime: number },
  candles: CandleData[],
  closeIdx: number,
  reason: BacktestTrade['closeReason'],
  config: BotConfig,
): BacktestTrade {
  const entryPrice = open.signal.suggestedPrice ?? candles[open.idx].close
  const closePrice = candles[closeIdx].close
  const size = config.positionSizeUsd / entryPrice
  const sign = open.signal.direction === 'long' ? 1 : -1
  const pnlUsd = sign * (closePrice - entryPrice) * size
  return {
    id: `bt-${open.idx}-${closeIdx}`,
    signalId: open.signal.id,
    signalSource: open.signal.source,
    direction: open.signal.direction,
    entryPrice,
    closePrice,
    size,
    pnlUsd,
    openedAtIdx: open.idx,
    closedAtIdx: closeIdx,
    openedAtTime: candles[open.idx].time,
    closedAtTime: candles[closeIdx].time,
    closeReason: reason,
  }
}

function emptyResult(candles: CandleData[]): BacktestResult {
  return {
    trades: [],
    totalPnlUsd: 0,
    winRate: 0,
    wins: 0,
    losses: 0,
    maxDrawdownUsd: 0,
    equityCurve: [],
    candleCount: candles.length,
    windowStart: candles[0]?.time ?? 0,
    windowEnd: candles[candles.length - 1]?.time ?? 0,
  }
}
