/**
 * hyperliquidTrading — signed L1 actions via the local agent key.
 *
 * Phase 2: place + cancel orders. Uses @nktkas/hyperliquid's `order`
 * and `cancel` methods with a viem `Account` derived from the agent's
 * private key. The user's master wallet is NOT involved here — they
 * only signed once during approveAgent.
 *
 * Network gating:
 *   - VITE_HYPERLIQUID_NETWORK=testnet → real action, testnet endpoint
 *   - VITE_HYPERLIQUID_NETWORK=mainnet → throws until Phase 3
 *   - Agent must exist, be on the current network, and be approved
 */

import { HttpTransport } from '@nktkas/hyperliquid'
import { order as sdkOrder, cancel as sdkCancel } from '@nktkas/hyperliquid/api/exchange'
import { privateKeyToAccount } from 'viem/accounts'
import { hlNetwork, loadAgent } from './hyperliquidAgent'

export interface WireOrder {
  /** Asset index from HyperliquidAdapter.markets[].id ↔ ordinal. */
  a: number
  /** true = buy/long, false = sell/short */
  b: boolean
  /** Price as decimal string, formatted to the venue's pxDecimals. */
  p: string
  /** Size as decimal string, formatted to the venue's stepSize. */
  s: string
  /** Reduce-only flag. */
  r: boolean
  /** Order type — limit only (market is IOC limit at slippage cap). */
  t: { limit: { tif: 'Gtc' | 'Ioc' | 'Alo' } }
  /** Optional client-side id (uuid). */
  c?: `0x${string}`
}

export interface PlaceResult {
  /** Venue order id (oid). May be undefined for IOC fills with no resting order. */
  oid?: number
  /** Average fill price if order filled immediately. */
  avgPx?: number
  /** Total filled size if any. */
  totalFilled?: number
  /** Raw SDK response — for diagnostics. */
  raw: unknown
}

function ensureAgent() {
  const agent = loadAgent()
  if (!agent) {
    throw new Error('No agent wallet — generate one in Profile → Hyperliquid agent wallet')
  }
  if (agent.network !== hlNetwork()) {
    throw new Error(
      `Agent was created on ${agent.network} but current network is ${hlNetwork()}. ` +
      'Forget the agent and generate a new one.'
    )
  }
  if (!agent.approvedAt) {
    throw new Error('Agent is generated but not yet approved — sign approval in Profile')
  }
  return agent
}

function transport() {
  return new HttpTransport({ isTestnet: hlNetwork() === 'testnet' })
}

/**
 * Submits a wire-shape order. Returns the venue's response (oid +
 * fills if any). On `status: "err"` from Hyperliquid the SDK throws,
 * so we never silently swallow rejections.
 */
export async function placeOrder(wire: WireOrder): Promise<PlaceResult> {
  const agent = ensureAgent()
  const wallet = privateKeyToAccount(agent.privateKey)

  const res = await sdkOrder(
    { transport: transport(), wallet },
    {
      orders: [wire],
      grouping: 'na',
    },
  )

  return parsePlaceResponse(res)
}

/**
 * Cancels an open order by (asset index, oid). The SDK expects both.
 */
export async function cancelOrder(args: { assetIndex: number; orderId: number }): Promise<void> {
  const agent = ensureAgent()
  const wallet = privateKeyToAccount(agent.privateKey)

  await sdkCancel(
    { transport: transport(), wallet },
    {
      cancels: [{ a: args.assetIndex, o: args.orderId }],
    },
  )
}

/**
 * Hyperliquid order responses come back as
 *   { status: "ok", response: { type: "order", data: { statuses: [...] } } }
 * where each status is one of:
 *   { resting: { oid } }   — limit order resting on book
 *   { filled: { oid, totalSz, avgPx } } — taker fill
 *   { error: <string> }    — soft rejection
 */
interface RawOrderStatus {
  resting?: { oid: number }
  filled?: { oid: number; totalSz: string; avgPx: string }
  error?: string
}

interface RawOrderResponse {
  response?: {
    data?: {
      statuses?: RawOrderStatus[]
    }
  }
}

function parsePlaceResponse(raw: unknown): PlaceResult {
  const out: PlaceResult = { raw }
  const status = (raw as RawOrderResponse)?.response?.data?.statuses?.[0]
  if (!status) return out

  if (status.error) {
    throw new Error(`Hyperliquid rejected order: ${status.error}`)
  }
  if (status.filled) {
    out.oid = status.filled.oid
    out.totalFilled = parseFloat(status.filled.totalSz) || 0
    out.avgPx = parseFloat(status.filled.avgPx) || undefined
    return out
  }
  if (status.resting) {
    out.oid = status.resting.oid
  }
  return out
}
