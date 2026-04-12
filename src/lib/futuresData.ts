/**
 * Futures data — client-side positions store with expiry and settlement.
 *
 * Futures positions are tracked in-memory and persisted to localStorage.
 * Settlement happens when a position's expiry timestamp passes.
 * Uses the same fee model as perp demo data.
 */

import type { OrderSide } from '../types/trading'
import type { FuturesTenor, FuturesPosition, FuturesSettlementRecord } from '../types/futures'
import { FEES } from './demoData'

// ─── Tenor durations (milliseconds) ────────────────────────────────────────

export const TENOR_DURATIONS: Record<FuturesTenor, number> = {
  '1W': 7 * 24 * 60 * 60 * 1000,
  '2W': 14 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  '3M': 90 * 24 * 60 * 60 * 1000,
}

/** Human-readable tenor labels. */
export const TENOR_LABELS: Record<FuturesTenor, string> = {
  '1W': '1 Week',
  '2W': '2 Weeks',
  '1M': '1 Month',
  '3M': '3 Months',
}

/** Base annualized basis premium per tenor (simulated). */
const BASE_PREMIUM: Record<FuturesTenor, number> = {
  '1W': 0.08,  // 8% annualized
  '2W': 0.07,
  '1M': 0.06,
  '3M': 0.05,
}

// ─── State ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'futures-dex.state.v1'

let futuresPositions: FuturesPosition[] = []
let futuresHistory: FuturesSettlementRecord[] = []
let version = 0

function markDirty() {
  version++
  debouncedSave()
}

export function getFuturesVersion(): number {
  return version
}

// ─── Persistence ────────────────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        positions: futuresPositions,
        history: futuresHistory,
      }))
    } catch { /* localStorage full */ }
  }, 500)
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (Array.isArray(data.positions)) futuresPositions = data.positions
    if (Array.isArray(data.history)) futuresHistory = data.history
  } catch { /* corrupted */ }
}

// Load on module init
loadState()

/** Reset all futures state (for testing). */
export function resetFuturesState(): void {
  futuresPositions = []
  futuresHistory = []
  version = 0
  localStorage.removeItem(STORAGE_KEY)
}

// ─── Basis Rate ─────────────────────────────────────────────────────────────

export function computeBasisRate(
  tenor: FuturesTenor,
): { basis: number; annualized: number } {
  const annualized = BASE_PREMIUM[tenor] + (Math.random() - 0.5) * 0.01
  const daysToExpiry = TENOR_DURATIONS[tenor] / (24 * 60 * 60 * 1000)
  const basis = annualized * (daysToExpiry / 365)
  return { basis, annualized }
}

export function computeExpiryTimestamp(tenor: FuturesTenor): number {
  return Date.now() + TENOR_DURATIONS[tenor]
}

// ─── Position Management ────────────────────────────────────────────────────

interface AddFuturesParams {
  market: string
  baseAsset: string
  side: OrderSide
  collateral: number
  leverage: number
  entryPrice: number
  tenor: FuturesTenor
}

export function addFuturesPosition(params: AddFuturesParams): {
  effectiveEntry: number
  openFee: number
  expiryTimestamp: number
} {
  const size = params.collateral * params.leverage
  const openFee = size * FEES.openFeeBps / 10_000
  const spreadCost = params.entryPrice * FEES.spreadBps / 10_000
  const effectiveEntry = params.side === 'long'
    ? params.entryPrice + spreadCost
    : params.entryPrice - spreadCost

  const collateralAfterFee = params.collateral - openFee
  const liqPrice = params.side === 'long'
    ? effectiveEntry * (1 - 0.95 / params.leverage)
    : effectiveEntry * (1 + 0.95 / params.leverage)

  const expiryTimestamp = computeExpiryTimestamp(params.tenor)
  const { annualized } = computeBasisRate(params.tenor)

  const position: FuturesPosition = {
    id: `futures-${params.market}-${params.side}-${Date.now()}`,
    market: params.market,
    baseAsset: params.baseAsset,
    side: params.side,
    size,
    collateral: collateralAfterFee,
    entryPrice: effectiveEntry,
    markPrice: params.entryPrice,
    leverage: params.leverage,
    liquidationPrice: liqPrice,
    pnl: 0,
    pnlPercent: 0,
    tenor: params.tenor,
    expiryTimestamp,
    openedAt: Date.now(),
    basisRateAtEntry: annualized,
    isSettled: false,
    settlementPrice: null,
    openFee,
  }

  futuresPositions.push(position)
  markDirty()

  return { effectiveEntry, openFee, expiryTimestamp }
}

/**
 * Get all futures positions with PnL recalculated from current prices.
 */
export function getFuturesPositions(
  getPrice: (market: string) => number | undefined,
): FuturesPosition[] {
  return futuresPositions.map(pos => {
    if (pos.isSettled) return pos

    const currentPrice = getPrice(pos.market) ?? pos.entryPrice
    const priceDelta = pos.side === 'long'
      ? currentPrice - pos.entryPrice
      : pos.entryPrice - currentPrice
    const pnl = (priceDelta / pos.entryPrice) * pos.size
    const pnlPercent = pos.collateral > 0 ? (pnl / pos.collateral) * 100 : 0

    return {
      ...pos,
      markPrice: currentPrice,
      pnl,
      pnlPercent,
    }
  })
}

/**
 * Get positions that are past expiry but not yet settled.
 */
export function getUnsettledExpired(): FuturesPosition[] {
  const now = Date.now()
  return futuresPositions.filter(p => !p.isSettled && p.expiryTimestamp <= now)
}

/**
 * Settle a futures position at the given price.
 */
export function settleFuturesPosition(
  id: string,
  settlementPrice: number,
): FuturesSettlementRecord | null {
  if (settlementPrice <= 0) return null

  const idx = futuresPositions.findIndex(p => p.id === id)
  if (idx === -1) return null

  const pos = futuresPositions[idx]
  if (pos.isSettled) return null

  const priceDelta = pos.side === 'long'
    ? settlementPrice - pos.entryPrice
    : pos.entryPrice - settlementPrice
  const pnl = (priceDelta / pos.entryPrice) * pos.size
  const closeFee = pos.size * FEES.closeFeeBps / 10_000

  // Mark as settled
  futuresPositions[idx] = {
    ...pos,
    isSettled: true,
    settlementPrice,
    markPrice: settlementPrice,
    pnl,
    pnlPercent: pos.collateral > 0 ? (pnl / pos.collateral) * 100 : 0,
  }

  const record: FuturesSettlementRecord = {
    id: pos.id,
    market: pos.market,
    side: pos.side,
    size: pos.size,
    entryPrice: pos.entryPrice,
    settlementPrice,
    pnl: pnl - closeFee,
    fee: pos.openFee + closeFee,
    tenor: pos.tenor,
    openedAt: pos.openedAt,
    settledAt: Date.now(),
  }

  futuresHistory.unshift(record)
  markDirty()
  return record
}

/**
 * Close a futures position early (before expiry).
 */
export function closeFuturesPosition(id: string, currentPrice: number): FuturesSettlementRecord | null {
  return settleFuturesPosition(id, currentPrice)
}

/**
 * Get settlement history.
 */
export function getFuturesHistory(): FuturesSettlementRecord[] {
  return futuresHistory
}

/**
 * Remove settled positions from the active list.
 */
export function cleanupSettledPositions(): void {
  futuresPositions = futuresPositions.filter(p => !p.isSettled)
  markDirty()
}
