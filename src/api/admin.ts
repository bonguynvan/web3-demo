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
