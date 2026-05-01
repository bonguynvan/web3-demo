/**
 * Bot import/export — versioned JSON for sharing strategies.
 *
 * Exported JSON drops the runtime fields (id, createdAt, enabled)
 * so a strategy is portable across users without leaking instance
 * state. Import generates fresh runtime values via botStore.addBot.
 *
 * Versioned at v: 1 — bump when the schema changes.
 */

import type { BotConfig, BotMode } from './types'
import type { SignalSource } from '../signals/types'

const SCHEMA_VERSION = 1
const VALID_SOURCES: SignalSource[] = [
  'funding', 'crossover', 'rsi', 'volatility', 'liquidation', 'news', 'whale', 'confluence',
]

export interface PortableBot {
  v: 1
  name: string
  mode: BotMode
  allowedSources: SignalSource[]
  allowedMarkets: string[]
  minConfidence: number
  positionSizeUsd: number
  holdMinutes: number
  maxTradesPerDay: number
}

export type ImportedBotConfig = Omit<BotConfig, 'id' | 'createdAt' | 'enabled'>

export function exportBot(b: BotConfig): string {
  const portable: PortableBot = {
    v: SCHEMA_VERSION,
    name: b.name,
    mode: b.mode,
    allowedSources: b.allowedSources,
    allowedMarkets: b.allowedMarkets,
    minConfidence: b.minConfidence,
    positionSizeUsd: b.positionSizeUsd,
    holdMinutes: b.holdMinutes,
    maxTradesPerDay: b.maxTradesPerDay,
  }
  return JSON.stringify(portable, null, 2)
}

export type ImportResult =
  | { ok: true; config: ImportedBotConfig }
  | { ok: false; error: string }

export function importBot(json: string): ImportResult {
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch {
    return { ok: false, error: 'Not valid JSON' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Expected an object' }
  }
  const p = parsed as Partial<PortableBot> & { v?: unknown }

  if (p.v !== SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported schema version (expected ${SCHEMA_VERSION}, got ${String(p.v)})` }
  }
  if (typeof p.name !== 'string' || !p.name.trim()) return { ok: false, error: 'Missing name' }
  if (p.mode !== 'paper' && p.mode !== 'live') return { ok: false, error: 'mode must be paper or live' }
  if (!Array.isArray(p.allowedSources)) return { ok: false, error: 'allowedSources must be an array' }
  if (!Array.isArray(p.allowedMarkets)) return { ok: false, error: 'allowedMarkets must be an array' }
  if (typeof p.minConfidence !== 'number' || p.minConfidence < 0 || p.minConfidence > 1) {
    return { ok: false, error: 'minConfidence must be a number between 0 and 1' }
  }
  if (typeof p.positionSizeUsd !== 'number' || p.positionSizeUsd <= 0) {
    return { ok: false, error: 'positionSizeUsd must be a positive number' }
  }
  if (typeof p.holdMinutes !== 'number' || p.holdMinutes <= 0) {
    return { ok: false, error: 'holdMinutes must be a positive number' }
  }
  if (typeof p.maxTradesPerDay !== 'number' || p.maxTradesPerDay <= 0) {
    return { ok: false, error: 'maxTradesPerDay must be a positive number' }
  }

  for (const s of p.allowedSources) {
    if (typeof s !== 'string' || !VALID_SOURCES.includes(s as SignalSource)) {
      return { ok: false, error: `Unknown signal source: ${String(s)}` }
    }
  }

  return {
    ok: true,
    config: {
      name: p.name.trim(),
      mode: p.mode,
      allowedSources: p.allowedSources as SignalSource[],
      allowedMarkets: p.allowedMarkets.filter((m): m is string => typeof m === 'string'),
      minConfidence: p.minConfidence,
      positionSizeUsd: p.positionSizeUsd,
      holdMinutes: p.holdMinutes,
      maxTradesPerDay: p.maxTradesPerDay,
    },
  }
}

/** Best-effort clipboard write. Returns true on success. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
