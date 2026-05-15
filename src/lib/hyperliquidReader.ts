/**
 * hyperliquidReader — unauthenticated public-data queries against
 * Hyperliquid's `/info` REST endpoint.
 *
 * No signing, no wallet connection. Anyone can paste any address and
 * read its on-chain perpetuals state. Used by the /hl viewer page.
 *
 * The on-wire shape from Hyperliquid is messy (everything is strings,
 * nested arrays, etc.) — we parse aggressively into a flat normalized
 * shape so the UI stays readable.
 */

const REST_URL = 'https://api.hyperliquid.xyz/info'

async function postInfo<T>(body: object, signal?: AbortSignal): Promise<T> {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hyperliquid /info HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  }
  return (await res.json()) as T
}

// ── Wire shapes (partial — only what we read) ─────────────────────────────

interface HlAssetPosition {
  position: {
    coin: string
    szi: string
    entryPx: string | null
    positionValue: string
    unrealizedPnl: string
    returnOnEquity: string
    leverage: { type: string; value: number }
    liquidationPx: string | null
    marginUsed: string
    maxLeverage: number
  }
}

interface HlClearinghouseState {
  marginSummary: {
    accountValue: string
    totalNtlPos: string
    totalRawUsd: string
    totalMarginUsed: string
  }
  crossMarginSummary?: {
    accountValue: string
    totalNtlPos: string
    totalRawUsd: string
    totalMarginUsed: string
  }
  withdrawable: string
  assetPositions: HlAssetPosition[]
  time: number
}

interface HlUserFill {
  coin: string
  px: string
  sz: string
  side: 'A' | 'B' // A = ask (sell), B = bid (buy)
  time: number
  startPosition: string
  dir: string
  closedPnl: string
  hash: string
  oid: number
  crossed: boolean
  fee: string
  liquidation?: unknown
}

// ── Normalized outputs ────────────────────────────────────────────────────

export interface HlPosition {
  coin: string
  side: 'long' | 'short'
  size: number
  entryPx: number | null
  notionalUsd: number
  unrealizedPnl: number
  roePct: number
  leverage: number
  liquidationPx: number | null
  marginUsedUsd: number
}

export interface HlAccount {
  address: string
  accountValueUsd: number
  totalNotionalUsd: number
  totalMarginUsedUsd: number
  withdrawableUsd: number
  positions: HlPosition[]
  fetchedAt: number
}

export interface HlFill {
  time: number
  coin: string
  side: 'buy' | 'sell'
  px: number
  size: number
  notionalUsd: number
  closedPnl: number
  feeUsd: number
  hash: string
}

// ── Public API ────────────────────────────────────────────────────────────

export function isValidAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim())
}

export async function fetchHlAccount(address: string, signal?: AbortSignal): Promise<HlAccount> {
  if (!isValidAddress(address)) throw new Error('Invalid 0x address')
  const raw = await postInfo<HlClearinghouseState>({ type: 'clearinghouseState', user: address }, signal)

  const positions: HlPosition[] = (raw.assetPositions ?? []).map(p => {
    const sz = parseFloat(p.position.szi)
    const entry = p.position.entryPx ? parseFloat(p.position.entryPx) : null
    return {
      coin: p.position.coin,
      side: sz >= 0 ? 'long' : 'short',
      size: Math.abs(sz),
      entryPx: entry,
      notionalUsd: parseFloat(p.position.positionValue) || 0,
      unrealizedPnl: parseFloat(p.position.unrealizedPnl) || 0,
      roePct: parseFloat(p.position.returnOnEquity) || 0,
      leverage: p.position.leverage?.value ?? 1,
      liquidationPx: p.position.liquidationPx ? parseFloat(p.position.liquidationPx) : null,
      marginUsedUsd: parseFloat(p.position.marginUsed) || 0,
    }
  })
  positions.sort((a, b) => b.notionalUsd - a.notionalUsd)

  return {
    address,
    accountValueUsd: parseFloat(raw.marginSummary?.accountValue) || 0,
    totalNotionalUsd: parseFloat(raw.marginSummary?.totalNtlPos) || 0,
    totalMarginUsedUsd: parseFloat(raw.marginSummary?.totalMarginUsed) || 0,
    withdrawableUsd: parseFloat(raw.withdrawable) || 0,
    positions,
    fetchedAt: Date.now(),
  }
}

export async function fetchHlFills(address: string, signal?: AbortSignal): Promise<HlFill[]> {
  if (!isValidAddress(address)) throw new Error('Invalid 0x address')
  const raw = await postInfo<HlUserFill[]>({ type: 'userFills', user: address }, signal)

  return (raw ?? []).map(f => {
    const px = parseFloat(f.px) || 0
    const sz = parseFloat(f.sz) || 0
    return {
      time: f.time,
      coin: f.coin,
      side: (f.side === 'B' ? 'buy' : 'sell') as 'buy' | 'sell',
      px,
      size: sz,
      notionalUsd: px * sz,
      closedPnl: parseFloat(f.closedPnl) || 0,
      feeUsd: parseFloat(f.fee) || 0,
      hash: f.hash,
    }
  }).sort((a, b) => b.time - a.time)
}
