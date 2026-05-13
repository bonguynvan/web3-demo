/**
 * Community proof — opt-in aggregate client.
 *
 * Mirrors the per-user ledger (resolved signals from
 * useSignalPerformanceStore) to the backend so the public /proof page
 * can show a network-wide hit rate. Both endpoints are anonymous —
 * payloads contain only the SPA's device_id (UUIDv4 generated on
 * first visit) plus the resolved-signal rows themselves.
 *
 * Endpoints:
 *   POST /api/proof/contribute  → { accepted: number }
 *   GET  /api/proof/aggregate   → see ProofAggregate below
 */

import { api } from './client'

export interface ContribItem {
  source: string
  market_id: string
  direction: 'long' | 'short'
  hit: boolean
  /** ISO RFC3339 — backend rejects anything older than 30 days. */
  closed_at: string
}

export interface ContribBody {
  device_id: string
  contributions: ContribItem[]
}

export async function contributeProof(body: ContribBody): Promise<{ accepted: number }> {
  return api<{ accepted: number }>('/api/proof/contribute', { body, auth: false })
}

export interface AggregateSourceRow {
  source: string
  total: number
  hits: number
  hit_rate: number
}

export interface ProofAggregate {
  window_days: number
  contributors: number
  by_source: AggregateSourceRow[]
  generated_at: string
}

export async function fetchProofAggregate(signal?: AbortSignal): Promise<ProofAggregate> {
  return api<ProofAggregate>('/api/proof/aggregate', { auth: false, signal })
}
