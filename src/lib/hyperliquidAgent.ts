/**
 * hyperliquidAgent — agent wallet metadata + vault-encrypted secret.
 *
 * The agent private key is sealed inside the credentials vault
 * (AES-GCM + PBKDF2-SHA256 @ 600k iterations). Only the public-side
 * metadata (address, network, approval status) lives in plain
 * localStorage. To sign orders we need the plaintext key in memory:
 * that's the in-tab `agentKeyCacheStore` populated on `unlockAgent()`.
 *
 * v1 of this module stored the private key in plain localStorage. v2
 * (this file) breaks the schema: any v1 record on disk is dropped on
 * load so we don't leak old keys forever. Users must regenerate.
 *
 * Network: VITE_HYPERLIQUID_NETWORK = mainnet | testnet (default).
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { seal, unseal, vaultExists, type VaultPayload } from './credentialsVault'
import { useAgentKeyCacheStore, getAgentPrivateKey as getCachedKey } from '../store/agentKeyCacheStore'

const STORAGE_KEY = 'tc-hl-agent-v2'
const LEGACY_STORAGE_KEY = 'tc-hl-agent-v1'

export type HlNetwork = 'mainnet' | 'testnet'

/**
 * Public-only agent metadata. Does NOT contain the private key —
 * that lives in the vault and (after unlock) in agentKeyCacheStore.
 */
export interface HlAgentRecord {
  address: `0x${string}`
  network: HlNetwork
  name: string
  createdAt: number
  /** Set once the master has signed `approveAgent`. Null until then. */
  approvedAt: number | null
  /** Master address that approved this agent (for UI display only). */
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
  // Drop any legacy v1 record on first load — those embed the private
  // key in plaintext localStorage, which we no longer accept.
  try { localStorage.removeItem(LEGACY_STORAGE_KEY) } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HlAgentRecord>
    if (typeof parsed.address !== 'string' || typeof parsed.createdAt !== 'number') return null
    const network: HlNetwork = parsed.network === 'mainnet' ? 'mainnet' : 'testnet'
    return {
      address: parsed.address as `0x${string}`,
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

function saveMetadata(rec: HlAgentRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec))
  } catch { /* full or denied */ }
}

export function clearAgent(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  useAgentKeyCacheStore.getState().clear()
}

export function markApproved(masterAddress: `0x${string}`): void {
  const existing = loadAgent()
  if (!existing) return
  saveMetadata({ ...existing, approvedAt: Date.now(), masterAddress })
}

/**
 * Generates a fresh agent key, seals it into the vault under the
 * given passphrase, and saves the public metadata to localStorage.
 * Also populates the in-memory cache so the user can immediately
 * sign without re-prompting for the passphrase.
 *
 * If a vault exists, the passphrase must unlock it (we merge into
 * the existing payload). If no vault exists yet, this creates one.
 */
export async function generateAgent(passphrase: string, name?: string): Promise<HlAgentRecord> {
  const pk = generatePrivateKey()
  const account = privateKeyToAccount(pk)

  let payload: VaultPayload
  if (vaultExists()) {
    payload = await unseal(passphrase) // throws WrongPassphraseError on mismatch
  } else {
    payload = { venues: {} }
  }
  payload.hlAgentKey = pk
  await seal(passphrase, payload)

  const rec: HlAgentRecord = {
    address: account.address,
    network: hlNetwork(),
    name: name ?? `tradingdek-${Date.now().toString(36).slice(-6)}`,
    createdAt: Date.now(),
    approvedAt: null,
    masterAddress: null,
  }
  saveMetadata(rec)
  useAgentKeyCacheStore.getState().setKey(pk)
  return rec
}

/**
 * Unseals the vault and loads the agent key into the in-memory cache.
 * Throws WrongPassphraseError if the passphrase is wrong, or a plain
 * Error if the vault has no agent key sealed inside.
 */
export async function unlockAgent(passphrase: string): Promise<void> {
  if (!vaultExists()) throw new Error('No vault yet — generate an agent first')
  const payload = await unseal(passphrase)
  if (!payload.hlAgentKey) {
    throw new Error('Vault unlocked but no agent key sealed inside — regenerate')
  }
  useAgentKeyCacheStore.getState().setKey(payload.hlAgentKey)
}

export function isAgentUnlocked(): boolean {
  return getCachedKey() !== null
}

export { getCachedKey as getAgentPrivateKey }
