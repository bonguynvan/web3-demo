/**
 * walkForward — parameter sweep with train/test validation.
 *
 * Single-shot backtests overfit. Pro-grade validation:
 *
 *   1. Split candle history into TRAIN (first N%) and TEST (rest).
 *   2. For each parameter combo in the sweep, run backtest on TRAIN.
 *   3. Pick the top-K configs by TRAIN PnL.
 *   4. Re-run those K configs on TEST.
 *   5. A config that performs well on BOTH is more likely to generalize.
 *      A config that only wins on TRAIN was lucky / overfit.
 *
 * v1 sweeps just stopLossPct × takeProfitPct (the most-tuned pair).
 * holdMinutes / minConfidence can be added later.
 */

import { runBacktest, type BacktestResult } from './backtest'
import type { BotConfig } from './types'
import type { CandleData } from '../types/trading'

export interface SweepAxis {
  /** Field name to sweep — currently 'stopLossPct' or 'takeProfitPct'. */
  field: 'stopLossPct' | 'takeProfitPct'
  /** Inclusive range. Step is the increment. */
  min: number
  max: number
  step: number
}

export interface WalkForwardRequest {
  baseConfig: BotConfig
  marketId: string
  candles: CandleData[]
  /** Fraction of candles used for training, e.g. 0.6 = first 60%. */
  trainFraction: number
  axes: [SweepAxis, SweepAxis]
  /** Top-K configs by TRAIN PnL to validate on TEST. */
  topK?: number
}

export interface SweepCell {
  slPct: number
  tpPct: number
  trainPnl: number
  trainTrades: number
  trainWinRate: number
  /** Filled in only for top-K configs. Undefined otherwise. */
  testPnl?: number
  testTrades?: number
  testWinRate?: number
  /** generalization = testPnl / trainPnl (capped at ±5). 1 = perfect. */
  generalization?: number
}

export interface WalkForwardResult {
  cells: SweepCell[]
  trainBars: number
  testBars: number
  topK: SweepCell[]
}

export function runWalkForward(req: WalkForwardRequest): WalkForwardResult {
  const { baseConfig, marketId, candles, trainFraction, axes } = req
  const topK = req.topK ?? 5
  const split = Math.floor(candles.length * trainFraction)
  const train = candles.slice(0, split)
  const test = candles.slice(split)

  const cells: SweepCell[] = []
  for (let a = axes[0].min; a <= axes[0].max + 1e-9; a += axes[0].step) {
    for (let b = axes[1].min; b <= axes[1].max + 1e-9; b += axes[1].step) {
      const cfg: BotConfig = {
        ...baseConfig,
        [axes[0].field]: round2(a),
        [axes[1].field]: round2(b),
      } as BotConfig
      const tr = runBacktest(cfg, marketId, train)
      cells.push({
        slPct: cfg.stopLossPct ?? 0,
        tpPct: cfg.takeProfitPct ?? 0,
        trainPnl: tr.totalPnlUsd,
        trainTrades: tr.trades.length,
        trainWinRate: tr.winRate,
      })
    }
  }

  // Pick top-K by train PnL and run them on the held-out test slice.
  const ranked = [...cells].sort((a, b) => b.trainPnl - a.trainPnl).slice(0, topK)
  for (const cell of ranked) {
    const cfg: BotConfig = {
      ...baseConfig,
      stopLossPct: cell.slPct,
      takeProfitPct: cell.tpPct,
    }
    const te: BacktestResult = runBacktest(cfg, marketId, test)
    cell.testPnl = te.totalPnlUsd
    cell.testTrades = te.trades.length
    cell.testWinRate = te.winRate
    cell.generalization = computeGen(cell.trainPnl, te.totalPnlUsd)
  }

  return {
    cells,
    trainBars: train.length,
    testBars: test.length,
    topK: ranked,
  }
}

/** Generalization ratio: testPnl / trainPnl, clamped to [-5, 5]. */
function computeGen(train: number, test: number): number {
  if (Math.abs(train) < 1e-9) return 0
  const r = test / train
  if (r > 5) return 5
  if (r < -5) return -5
  return r
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
