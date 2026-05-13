/**
 * AI signal explainer client — calls /api/ai/explain on the backend.
 * Pro-gated server-side; the backend returns 402 for free users so
 * the SPA can open the upgrade modal without leaking a Claude call.
 */

import { api } from './client'

export interface ExplainRequest {
  source: string
  market_id: string
  direction: 'long' | 'short'
  confidence: number
  title: string
  detail: string
  price?: number
  change_24h?: number
}

export interface ExplainResponse {
  explanation: string
  risk: string
}

export async function explainSignal(req: ExplainRequest): Promise<ExplainResponse> {
  return api<ExplainResponse>('/api/ai/explain', { body: req })
}
