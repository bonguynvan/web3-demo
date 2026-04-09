/**
 * Demo data — mutable state for demo mode with realistic fee structure.
 *
 * Fee model (mirrors real perp DEXs):
 * - Open fee: 0.1% of position size (deducted from collateral)
 * - Close fee: 0.1% of position size (deducted from payout)
 * - Spread: 0.05% applied to entry price (longs pay higher, shorts lower)
 * - Funding: 0.01% per 8h cycle (deducted from collateral)
 * - Price impact: 0-0.05% based on size vs pool
 */

import type { Trade } from '../types/trading'

const PRICE_PRECISION = 10n ** 30n

// ─── Fee config ───

export const FEES = {
  openFeeBps: 10,       // 0.1% of position size
  closeFeeBps: 10,      // 0.1% of position size
  spreadBps: 5,         // 0.05% applied to entry price
  fundingRatePerH: 0.00125, // ~0.01% per 8h
  liquidationFee: 5,    // $5 flat
  maxPriceImpactBps: 5, // 0.05% max
  poolSize: 2_500_000,  // for price impact calculation
} as const

function bps(amount: number, bps: number): number {
  return amount * bps / 10_000
}

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
  markDirty()
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
  // Fee tracking
  openFee: number
  accumulatedFunding: number
  openedAt: number
}

const demoPositions: DemoPosition[] = []

// Change counter — hooks poll this to detect mutations.
// Every mutation should go through markDirty() (not a bare changeVersion++)
// so the persistence layer gets a chance to debounce a save.
let changeVersion = 0
export function getDemoVersion(): number { return changeVersion }
export function bumpDemoVersion(): void { markDirty() }

export function getDemoPositions(prices: DemoPrice[]): DemoPosition[] {
  const now = Date.now()

  for (const pos of demoPositions) {
    const price = prices.find(p => p.market === pos.market)
    if (price) {
      pos.markPrice = price.price

      // PnL from price movement
      const priceDelta = pos.side === 'long'
        ? (price.price - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - price.price) / pos.entryPrice
      const rawPnl = priceDelta * pos.size

      // Accumulate funding over time (continuous, not just every 8h)
      const hoursOpen = (now - pos.openedAt) / 3_600_000
      pos.accumulatedFunding = pos.size * FEES.fundingRatePerH * hoursOpen

      // Net PnL = price PnL - accumulated funding
      pos.pnl = rawPnl - pos.accumulatedFunding
      pos.pnlPercent = pos.collateral > 0 ? (pos.pnl / pos.collateral) * 100 : 0
    }
  }
  return [...demoPositions]
}

export interface OpenPositionParams {
  key: string
  market: string
  baseAsset: string
  side: 'long' | 'short'
  collateral: number
  leverage: number
  entryPrice: number
  tp?: number
  sl?: number
}

/** Open a demo position with realistic fees and spread */
export function addDemoPosition(params: OpenPositionParams): {
  effectiveEntry: number
  openFee: number
  priceImpact: number
  netCollateral: number
} {
  const { key, market, baseAsset, side, collateral, leverage, entryPrice, tp, sl } = params
  const size = collateral * leverage

  // Calculate fees
  const openFee = bps(size, FEES.openFeeBps)
  const priceImpact = bps(size, Math.min(FEES.maxPriceImpactBps, Math.round(size / FEES.poolSize * 100)))

  // Apply spread to entry price
  const spreadAmount = entryPrice * FEES.spreadBps / 10_000
  const effectiveEntry = side === 'long'
    ? entryPrice + spreadAmount // longs pay higher
    : entryPrice - spreadAmount // shorts pay lower

  // Net collateral after open fee
  const netCollateral = collateral - openFee

  // Liquidation price
  const liqPrice = side === 'long'
    ? effectiveEntry * (1 - 0.95 / leverage)
    : effectiveEntry * (1 + 0.95 / leverage)

  // Deduct from balance
  DEMO_ACCOUNT.balance -= collateral

  demoPositions.push({
    key,
    market,
    baseAsset,
    indexToken: '0x0' as `0x${string}`,
    side,
    size,
    sizeRaw: toRaw(size),
    collateral: netCollateral,
    collateralRaw: toRaw(netCollateral),
    entryPrice: effectiveEntry,
    entryPriceRaw: toRaw(effectiveEntry),
    markPrice: effectiveEntry,
    leverage: `${leverage.toFixed(1)}x`,
    pnl: 0,
    pnlPercent: 0,
    liquidationPrice: Math.max(0, liqPrice),
    openFee,
    accumulatedFunding: 0,
    openedAt: Date.now(),
  })
  markDirty()

  // Add to history as "Open"
  demoHistory.unshift({
    id: `h-${Date.now()}-open`,
    market,
    side,
    action: 'Open',
    size,
    entryPrice: effectiveEntry,
    closePrice: effectiveEntry,
    realizedPnl: -openFee, // open fee is a cost
    fee: openFee,
    time: Date.now(),
  })

  // TP/SL orders
  if (tp && tp > 0) {
    demoOrders.push({
      id: `o-${Date.now()}-tp`, market, side,
      type: 'Take Profit', triggerPrice: tp, size, positionKey: key,
      createdAt: Date.now(),
    })
  }
  if (sl && sl > 0) {
    demoOrders.push({
      id: `o-${Date.now()}-sl`, market, side,
      type: 'Stop Loss', triggerPrice: sl, size, positionKey: key,
      createdAt: Date.now(),
    })
  }

  return { effectiveEntry, openFee, priceImpact, netCollateral }
}

export function closeDemoPosition(key: string, closePct: number): { realizedPnl: number; closeFee: number } | null {
  const pos = demoPositions.find(p => p.key === key)
  if (!pos) return null

  const closedSize = pos.size * (closePct / 100)
  const closeFee = bps(closedSize, FEES.closeFeeBps)
  const grossPnl = pos.pnl * (closePct / 100)
  const fundingCost = pos.accumulatedFunding * (closePct / 100)
  const realizedPnl = grossPnl - closeFee
  const returnedCollateral = pos.collateral * (closePct / 100)

  // Return collateral + PnL to balance
  DEMO_ACCOUNT.balance += returnedCollateral + realizedPnl

  // Add to trade history
  demoHistory.unshift({
    id: `h-${Date.now()}-close`,
    market: pos.market,
    side: pos.side,
    action: 'Close',
    size: closedSize,
    entryPrice: pos.entryPrice,
    closePrice: pos.markPrice,
    realizedPnl,
    fee: closeFee + fundingCost,
    time: Date.now(),
  })

  if (closePct >= 100) {
    const idx = demoPositions.findIndex(p => p.key === key)
    if (idx >= 0) demoPositions.splice(idx, 1)
    for (let i = demoOrders.length - 1; i >= 0; i--) {
      if (demoOrders[i].positionKey === key) demoOrders.splice(i, 1)
    }
  } else {
    pos.size *= (1 - closePct / 100)
    pos.collateral *= (1 - closePct / 100)
    pos.sizeRaw = toRaw(pos.size)
    pos.collateralRaw = toRaw(pos.collateral)
  }

  markDirty()
  return { realizedPnl, closeFee }
}

// ─── Pending orders (TP/SL + Limit opens) ───
//
// The contracts don't support limit orders on-chain, so pending limits live
// client-side here and are rendered on the chart + in the Orders tab. Demo
// and live mode share this store because neither has a real backend for it.
// Known limit: module-level array, not persisted — a page refresh clears
// any pending orders. Acceptable MVP; localStorage persistence is a trivial
// follow-up if it becomes a pain.

export type DemoOrderType = 'Take Profit' | 'Stop Loss' | 'Limit'

export interface DemoOrder {
  id: string
  market: string
  side: 'long' | 'short'
  type: DemoOrderType
  triggerPrice: number
  /** Notional size in USD (for Limit) or underlying position size in USD (for TP/SL) */
  size: number
  /** Position slot this order reduces (TP/SL only) — empty for Limit opens. */
  positionKey: string
  createdAt: number
  /** Leverage for Limit opens. Undefined for TP/SL. */
  leverage?: number
  /** Collateral in USD for Limit opens. Undefined for TP/SL. */
  collateral?: number
}

const demoOrders: DemoOrder[] = []

export function getDemoOrders(): DemoOrder[] {
  return [...demoOrders]
}

export function cancelDemoOrder(id: string) {
  const idx = demoOrders.findIndex(o => o.id === id)
  if (idx >= 0) { demoOrders.splice(idx, 1); markDirty() }
}

/**
 * Store a pending Limit open order. Does NOT touch on-chain state — caller
 * is responsible for later triggering the actual increase if/when the price
 * condition is met. For now we just display it on the chart and in the
 * Orders tab; execution is manual via the cancel button.
 */
export function addDemoPendingLimit(params: {
  market: string
  side: 'long' | 'short'
  triggerPrice: number
  sizeUsd: number
  leverage: number
  collateralUsd: number
}): DemoOrder {
  const order: DemoOrder = {
    id: `limit-${params.market}-${params.side}-${Date.now()}`,
    market: params.market,
    side: params.side,
    type: 'Limit',
    triggerPrice: params.triggerPrice,
    size: params.sizeUsd,
    positionKey: '', // no underlying position yet
    createdAt: Date.now(),
    leverage: params.leverage,
    collateral: params.collateralUsd,
  }
  demoOrders.push(order)
  markDirty()
  return order
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
  const totalReserved = demoPositions.reduce((s, p) => s + p.size, 0)
  return {
    poolAmount: FEES.poolSize,
    reservedAmount: totalReserved,
    availableLiquidity: FEES.poolSize - totalReserved,
    aum: FEES.poolSize,
    utilizationPercent: FEES.poolSize > 0 ? (totalReserved / FEES.poolSize) * 100 : 0,
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

// ─── localStorage persistence ───────────────────────────────────────────────
//
// Persists the client-side state that would otherwise be lost on a page
// refresh: balance, positions, pending orders, trade history. Everything
// derivable from live price ticks is intentionally NOT persisted — it
// recomputes from structural fields + the next tick.
//
// Why not SQLite-in-browser: 1–2 MB of WASM for <10 KB of data is overkill.
// localStorage is synchronous, bounded at 5 MB per origin, and already used
// for chart layout and theme.
//
// Schema versioning: the envelope carries a `version` field. If the version
// doesn't match CLIENT_STATE_VERSION, the blob is dropped and in-memory
// state starts fresh. No migration framework — this is dev-mode scratch data.
//
// Known limits:
//  - Cross-tab: two tabs can race. Last write wins. Acceptable — demo is
//    per-tab conceptually and pending limits are rare enough to not matter.
//  - Private browsing / quota exceeded: silent failure, in-memory state
//    keeps working.
//  - No per-account scoping: all pending orders share one blob, so
//    switching live-mode accounts mid-session sees the previous account's
//    pending orders. Fine for single-user dev; fix with address-keyed
//    storage when multi-user becomes real.

const STORAGE_KEY = 'perp-dex.client-state.v1'
const CLIENT_STATE_VERSION = 1
const SAVE_DEBOUNCE_MS = 100

// Persisted shape. Only structural fields that can't be re-derived from
// live data. Adding a field here without bumping CLIENT_STATE_VERSION is
// safe as long as the loader tolerates missing fields (via `??` defaults).
interface StoredPosition {
  key: string
  market: string
  baseAsset: string
  indexToken: `0x${string}`
  side: 'long' | 'short'
  size: number
  collateral: number
  entryPrice: number
  leverage: string
  liquidationPrice: number
  openFee: number
  accumulatedFunding: number
  openedAt: number
}

interface ClientStateEnvelope {
  version: number
  savedAt: number
  balance: number
  plpBalance: number
  positions: StoredPosition[]
  orders: DemoOrder[]
  history: DemoTradeHistory[]
}

function toStoredPosition(pos: DemoPosition): StoredPosition {
  return {
    key: pos.key,
    market: pos.market,
    baseAsset: pos.baseAsset,
    indexToken: pos.indexToken,
    side: pos.side,
    size: pos.size,
    collateral: pos.collateral,
    entryPrice: pos.entryPrice,
    leverage: pos.leverage,
    liquidationPrice: pos.liquidationPrice,
    openFee: pos.openFee,
    accumulatedFunding: pos.accumulatedFunding,
    openedAt: pos.openedAt,
  }
}

function fromStoredPosition(sp: StoredPosition): DemoPosition {
  // markPrice / pnl / pnlPercent seed from the structural state and get
  // overwritten by the next getDemoPositions() pass against live prices.
  return {
    key: sp.key,
    market: sp.market,
    baseAsset: sp.baseAsset,
    indexToken: sp.indexToken,
    side: sp.side,
    size: sp.size,
    sizeRaw: toRaw(sp.size),
    collateral: sp.collateral,
    collateralRaw: toRaw(sp.collateral),
    entryPrice: sp.entryPrice,
    entryPriceRaw: toRaw(sp.entryPrice),
    markPrice: sp.entryPrice,
    leverage: sp.leverage,
    pnl: 0,
    pnlPercent: 0,
    liquidationPrice: sp.liquidationPrice,
    openFee: sp.openFee,
    accumulatedFunding: sp.accumulatedFunding,
    openedAt: sp.openedAt,
  }
}

function saveToStorage(): void {
  try {
    const envelope: ClientStateEnvelope = {
      version: CLIENT_STATE_VERSION,
      savedAt: Date.now(),
      balance: DEMO_ACCOUNT.balance,
      plpBalance: DEMO_ACCOUNT.plpBalance,
      positions: demoPositions.map(toStoredPosition),
      orders: [...demoOrders],
      history: [...demoHistory],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    // Quota exceeded, private browsing, storage disabled — swallow and let
    // the in-memory copy keep serving requests. The next save attempt may
    // succeed if the user frees storage.
  }
}

function loadFromStorage(): void {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return
  }
  if (!raw) return

  let envelope: ClientStateEnvelope
  try {
    envelope = JSON.parse(raw) as ClientStateEnvelope
  } catch {
    // Corrupt blob — drop it and start fresh rather than failing forever.
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    return
  }

  if (envelope.version !== CLIENT_STATE_VERSION) {
    // Schema bumped. Drop the old blob, no migration.
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    return
  }

  // Hydrate in place so any hooks that captured the array references still
  // see the loaded data.
  if (typeof envelope.balance === 'number') {
    DEMO_ACCOUNT.balance = envelope.balance
  }
  if (typeof envelope.plpBalance === 'number') {
    DEMO_ACCOUNT.plpBalance = envelope.plpBalance
  }

  if (Array.isArray(envelope.positions)) {
    demoPositions.length = 0
    for (const sp of envelope.positions) {
      demoPositions.push(fromStoredPosition(sp))
    }
  }

  if (Array.isArray(envelope.orders)) {
    demoOrders.length = 0
    for (const o of envelope.orders) demoOrders.push(o)
  }

  if (Array.isArray(envelope.history)) {
    demoHistory.length = 0
    for (const h of envelope.history) demoHistory.push(h)
  }

  // Note: we don't bump changeVersion here. Hooks poll getDemoVersion on
  // their own interval and will pick up the loaded state on next tick.
  // Bumping here would trigger a save before the first mutation, which is
  // harmless but wasteful.
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Every state mutation must call this instead of `changeVersion++`. It
 * bumps the version so subscribers re-render AND schedules a debounced
 * save so we don't thrash localStorage during batched mutations.
 */
function markDirty(): void {
  changeVersion++
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveToStorage()
  }, SAVE_DEBOUNCE_MS)
}

// Guard: only run in a real browser. SSR / test environments that lack
// `window.localStorage` skip the load path and continue with in-memory state.
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  loadFromStorage()
}

/** Wipe the persisted client state. Useful for testing or a "reset" button. */
export function clearClientStateStorage(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}
