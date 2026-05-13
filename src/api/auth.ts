/**
 * SIWE-lite client.
 *
 * Two-step wallet sign-in matched to the Go backend in
 * backend/pocketbase/siwe.go:
 *
 *   1. requestNonce(address)   → GET  /api/siwe/nonce
 *   2. verifySignature(...)    → POST /api/siwe/verify  →  { token, user }
 *
 * The caller is responsible for prompting the wallet to sign the message
 * returned by buildSiweMessage(). Doing the signing here would couple
 * this module to wagmi/viem; the caller already has those imports.
 */

import { api } from './client'

export interface NonceResponse {
  nonce: string
  expires: number
}

export interface VerifyResponse {
  token: string
  user: {
    id: string
    wallet_address: string
  }
}

export async function requestNonce(address: string): Promise<NonceResponse> {
  return api<NonceResponse>(`/api/siwe/nonce?address=${encodeURIComponent(address.toLowerCase())}`)
}

export async function verifySignature(input: {
  address: string
  message: string
  signature: string
  /** Optional referrer userId — backend may grant trial extension. */
  referrer?: string
}): Promise<VerifyResponse> {
  return api<VerifyResponse>('/api/siwe/verify', { body: input, auth: false })
}

/**
 * The signed message format MUST match the parser in siwe.go — the
 * backend looks for `nonce: <…>` on its own line. Everything else is
 * cosmetic for the wallet prompt.
 */
export function buildSiweMessage(address: string, nonce: string): string {
  const issued = Date.now()
  return [
    'Sign in to TradingDek',
    '',
    `address: ${address.toLowerCase()}`,
    `nonce: ${nonce}`,
    `issued: ${issued}`,
  ].join('\n')
}

export interface Me {
  user: { id: string; wallet_address: string }
  pro_active: boolean
  pro_days_remaining: number
  paygo_balance_usd: number
  trial_expires_at: string | null
}

export async function fetchMe(signal?: AbortSignal): Promise<Me> {
  return api<Me>('/api/me', { signal })
}
