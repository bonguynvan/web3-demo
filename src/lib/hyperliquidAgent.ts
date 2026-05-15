/**
 * hyperliquidAgent — local-only agent wallet store.
 *
 * Hyperliquid's "agent wallet" model lets a master account approve a
 * disposable subkey to sign orders on its behalf. The master signs
 * `approveAgent` once (EIP-712 via the user's connected wallet); from
 * then on, the agent's private key — held entirely in the user's
 * browser — can sign individual orders without a wallet prompt every
 * time.
 *
 * Storage: localStorage key `tc-hl-agent-v1`. NOT encrypted in Phase 1
 * — it's a low-privilege key that can only place orders (no
 * withdrawals, no balance moves). On mainnet we'll route this through
 * the credentials vault before unlocking live trading.
 *
 * Phase 1 forces `VITE_HYPERLIQUID_NETWORK=testnet` — mainnet calls
 * throw until Phase 3 graduates the flow.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const STORAGE_KEY = 'tc-hl-agent-v1'

export type HlNetwork = 'mainnet' | 'testnet'

export interface HlAgentRecord {
  address: `0x${string}`
  privateKey: `0x${string}`
  network: HlNetwork
  name: string
  createdAt: number
  /** Set once the master has signed `approveAgent` on chain. Null until then. */
  approvedAt: number | null
  /** Optional master address that approved this agent (for UI display only). */
  masterAddress: `0x${string}` | null
}

export function hlNetwork(): HlNetwork {
  const v = (import.meta.env.VITE_HYPERLIQUID_NETWORK as string | undefined)?.trim().toLowerCase()
  return v === 'mainnet' ? 'mainnet' : 'testnet'
}

export function hlIsMainnet(): boolean {
  return hlNetwork() === 'mainnet'
}

export function loadAgent(): HlAgentRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HlAgentRecord>
    if (
      typeof parsed.address !== 'string' ||
      typeof parsed.privateKey !== 'string' ||
      typeof parsed.createdAt !== 'number'
    ) return null
    const network: HlNetwork = parsed.network === 'mainnet' ? 'mainnet' : 'testnet'
    return {
      address: parsed.address as `0x${string}`,
      privateKey: parsed.privateKey as `0x${string}`,
      network,
      name: typeof parsed.name === 'string' ? parsed.name : 'tradingdek',
      createdAt: parsed.createdAt,
      approvedAt: typeof parsed.approvedAt === 'number' ? parsed.approvedAt : null,
      masterAddress: (typeof parsed.masterAddress === 'string' ? parsed.masterAddress : null) as `0x${string}` | null,
    }
  } catch {
    return null
  }
}

export function saveAgent(rec: HlAgentRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec))
  } catch { /* full or denied */ }
}

export function clearAgent(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/**
 * Generates a fresh agent wallet. The private key is a 32-byte hex
 * string; the address is its keccak256 derivation. NOT yet approved
 * on chain — call the approve flow separately.
 */
export function generateAgent(name: string = `tradingdek-${Date.now().toString(36).slice(-6)}`): HlAgentRecord {
  const pk = generatePrivateKey()
  const account = privateKeyToAccount(pk)
  const rec: HlAgentRecord = {
    address: account.address,
    privateKey: pk,
    network: hlNetwork(),
    name,
    createdAt: Date.now(),
    approvedAt: null,
    masterAddress: null,
  }
  saveAgent(rec)
  return rec
}

export function markApproved(masterAddress: `0x${string}`): void {
  const existing = loadAgent()
  if (!existing) return
  saveAgent({ ...existing, approvedAt: Date.now(), masterAddress })
}
