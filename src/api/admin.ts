/**
 * Admin metrics client.
 *
 * Calls the operator-only GET /api/admin/metrics with the shared
 * secret in the x-admin-key header. The secret comes from
 * VITE_ADMIN_KEY at build time — only set in the operator's own
 * build, never shipped to the public bundle.
 */

import { apiBase, apiAvailable, ApiError } from './client'

const ADMIN_KEY = (import.meta.env.VITE_ADMIN_KEY as string | undefined)?.trim()

export function adminAvailable(): boolean {
  return apiAvailable() && !!ADMIN_KEY
}

export interface AdminUserRow {
  id: string
  wallet_address: string
  created: string
  pro_active: boolean
  pro_days_remaining: number
  paygo_balance_usd: number
  trial_expires_at: string
}

export interface AdminInvoiceRow {
  id: string
  wallet_address: string
  kind: string
  amount_usd: number
  status: string
  paid_at: string
  created: string
  pay_currency: string
}

export interface AdminProofRow {
  id: string
  source: string
  market_id: string
  direction: string
  hit: boolean | null
  closed_at: string
  created: string
}

export interface AdminMetrics {
  generated_at: string
  users_total: number
  entitlements?: {
    total: number
    pro_active: number
    on_trial: number
    paid_days_active: number
    paygo_active: number
  }
  revenue_usd: number
  invoices_paid: number
  invoices_by_kind: Record<string, { count: number; sum_usd: number }>
  proof_contributions_30d?: { rows: number; contributors: number }
  signups_daily?: Array<{ day: string; n: number }>
  revenue_daily?: Array<{ day: string; sum: number }>
  recent_users?: AdminUserRow[]
  recent_invoices?: AdminInvoiceRow[]
  recent_proof?: AdminProofRow[]
  proof_by_source?: Array<{ source: string; n: number; hits: number }>
  proof_by_market?: Array<{ market_id: string; n: number }>
}

export async function fetchAdminMetrics(signal?: AbortSignal): Promise<AdminMetrics> {
  if (!ADMIN_KEY) throw new ApiError(0, null, 'admin key not configured (VITE_ADMIN_KEY unset)')
  const res = await fetch(`${apiBase()}/api/admin/metrics`, {
    method: 'GET',
    headers: { 'x-admin-key': ADMIN_KEY },
    signal,
  })
  const text = await res.text()
  let parsed: unknown = null
  try { parsed = JSON.parse(text) } catch { parsed = text }
  if (!res.ok) {
    const msg = typeof parsed === 'object' && parsed !== null && 'error' in parsed
      ? String((parsed as { error: unknown }).error)
      : `HTTP ${res.status}`
    throw new ApiError(res.status, parsed, msg)
  }
  return parsed as AdminMetrics
}
