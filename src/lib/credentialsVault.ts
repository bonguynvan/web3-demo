/**
 * credentialsVault — passphrase-encrypted local storage for venue API keys.
 *
 * Self-host / personal-machine path: keys live in localStorage but only
 * as AES-GCM ciphertext, derived from a user-provided passphrase via
 * PBKDF2-SHA256. Plaintext never touches storage. Without the
 * passphrase, the data is unrecoverable — by design.
 *
 * Multi-user prod must use a server-side proxy instead. See
 * memory/project_api_connections_and_profile.md.
 *
 * Schema (localStorage key `tc-creds-vault-v1`, JSON):
 *   {
 *     v: 1,
 *     kdf: { salt: base64, iterations: 600_000 },
 *     iv: base64,
 *     ct: base64,
 *   }
 */

import type { VenueCredentials, VenueId } from '../adapters/types'

const STORAGE_KEY = 'tc-creds-vault-v1'
const VAULT_VERSION = 1
const PBKDF2_ITERATIONS = 600_000
const SALT_BYTES = 16
const IV_BYTES = 12

interface VaultEnvelope {
  v: number
  kdf: { salt: string; iterations: number }
  iv: string
  ct: string
}

export interface VaultEntryMeta {
  /** Epoch ms when this venue's credentials were sealed. */
  addedAt: number
}

export interface VaultPayload {
  venues: Partial<Record<VenueId, VenueCredentials>>
  /** Per-venue metadata (timestamps, last-used, etc.). Backward-compatible
   *  — older vaults that omit this still decrypt fine. */
  meta?: Partial<Record<VenueId, VaultEntryMeta>>
}

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s)
}

function b64ToBuf(s: string): Uint8Array {
  const bin = atob(s)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** True if a sealed vault exists in this browser. */
export function vaultExists(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== null } catch { return false }
}

/** Encrypt + persist. Overwrites any existing vault. */
export async function seal(passphrase: string, payload: VaultPayload): Promise<void> {
  if (!passphrase) throw new Error('Passphrase required')
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS)
  const enc = new TextEncoder()
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(payload)),
  )
  const env: VaultEnvelope = {
    v: VAULT_VERSION,
    kdf: { salt: bufToB64(salt), iterations: PBKDF2_ITERATIONS },
    iv: bufToB64(iv),
    ct: bufToB64(ct),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(env))
}

export class WrongPassphraseError extends Error {
  constructor() { super('Wrong passphrase or corrupt vault') }
}

/** Try to decrypt. Throws WrongPassphraseError on bad passphrase. */
export async function unseal(passphrase: string): Promise<VaultPayload> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) throw new Error('No vault stored')
  const env = JSON.parse(raw) as VaultEnvelope
  if (env.v !== VAULT_VERSION) throw new Error(`Unsupported vault version ${env.v}`)
  const salt = b64ToBuf(env.kdf.salt)
  const iv = b64ToBuf(env.iv)
  const ct = b64ToBuf(env.ct)
  const key = await deriveKey(passphrase, salt, env.kdf.iterations)
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  } catch {
    throw new WrongPassphraseError()
  }
  const dec = new TextDecoder()
  return JSON.parse(dec.decode(plain)) as VaultPayload
}

/** Delete the vault entirely. */
export function clear(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}
