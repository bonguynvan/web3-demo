/**
 * NOWPayments client — invoice creation only.
 *
 * The SPA POSTs to NOWPayments' public REST API to mint a hosted-checkout
 * invoice; the user redirects there to pay. The backend never sees the
 * payment until the IPN webhook fires (handled in backend/pocketbase/nowpay.go).
 *
 * We use the PUBLIC API key (VITE_NOWPAY_PUBLIC_KEY). This key can create
 * invoices but cannot read account data — safe to ship in the bundle.
 *
 * order_id MUST be "<userId>:<kind>" — the backend webhook splits on `:`
 * to route the credit:
 *
 *    paygo_topup  → balance += amount
 *    sub_30       → +30 days
 *    sub_180      → +180 days
 *    sub_365      → +365 days
 */

const NOWPAY_API = 'https://api.nowpayments.io/v1'
const KEY = (import.meta.env.VITE_NOWPAY_PUBLIC_KEY as string | undefined) ?? ''
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/+$/, '')

export function nowpayAvailable(): boolean {
  return KEY.length > 0 && API_BASE.length > 0
}

export type InvoiceKind = 'paygo_topup' | 'sub_30' | 'sub_180' | 'sub_365'

export interface InvoiceRequest {
  userId: string
  kind: InvoiceKind
  amountUsd: number
  /** Where NOWPayments redirects after success/cancel. */
  returnTo: string
}

export interface InvoiceResponse {
  id: string
  invoice_url: string
  order_id: string
  price_amount: number
  price_currency: string
}

export async function createInvoice(req: InvoiceRequest): Promise<InvoiceResponse> {
  if (!nowpayAvailable()) {
    throw new Error('NOWPayments not configured')
  }
  const body = {
    price_amount: req.amountUsd,
    price_currency: 'usd',
    order_id: `${req.userId}:${req.kind}`,
    order_description: humanLabel(req.kind, req.amountUsd),
    ipn_callback_url: `${API_BASE}/api/webhooks/nowpay`,
    success_url: req.returnTo,
    cancel_url: req.returnTo,
    is_fixed_rate: true,
  }
  const res = await fetch(`${NOWPAY_API}/invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': KEY,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`NOWPayments invoice failed (${res.status}): ${t}`)
  }
  return res.json() as Promise<InvoiceResponse>
}

function humanLabel(kind: InvoiceKind, amount: number): string {
  switch (kind) {
    case 'paygo_topup': return `TradingDek balance top-up ($${amount.toFixed(2)})`
    case 'sub_30':      return 'TradingDek Pro — 30 days'
    case 'sub_180':     return 'TradingDek Pro — 180 days'
    case 'sub_365':     return 'TradingDek Pro — 365 days'
  }
}
