/**
 * errorReporter — minimal client error capture.
 *
 * Installs window-level listeners for runtime errors and unhandled
 * promise rejections, then either POSTs to an optional reporting
 * endpoint or logs locally. Also exposes `report()` so the React
 * ErrorBoundary can hand off render-time errors.
 *
 * Stays small on purpose: no batching, no replay, no source-map
 * lookup. When the product earns a real Sentry budget, swap the
 * payload shape and POST target — every caller already routes
 * through `report()`.
 *
 * Throttled at 5 reports / 60s so a runaway error loop can't DoS the
 * user or the destination endpoint.
 */

import { getDeviceId } from '../store/deviceIdStore'

const ENDPOINT = import.meta.env.VITE_ERROR_REPORT_ENDPOINT as string | undefined
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5

interface ErrorPayload {
  message: string
  stack?: string
  kind: 'runtime' | 'unhandled-rejection' | 'react'
  route: string
  ua: string
  deviceId: string
  at: number
  context?: Record<string, unknown>
}

let bucketStart = 0
let bucketCount = 0
let installed = false

function shouldEmit(): boolean {
  const now = Date.now()
  if (now - bucketStart > WINDOW_MS) {
    bucketStart = now
    bucketCount = 0
  }
  bucketCount += 1
  return bucketCount <= MAX_PER_WINDOW
}

function buildPayload(
  kind: ErrorPayload['kind'],
  message: string,
  stack: string | undefined,
  context?: Record<string, unknown>,
): ErrorPayload {
  return {
    message: message.slice(0, 2000),
    stack: stack?.slice(0, 4000),
    kind,
    route: typeof window !== 'undefined' ? window.location.pathname : '/',
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    deviceId: getDeviceId(),
    at: Date.now(),
    context,
  }
}

async function send(payload: ErrorPayload): Promise<void> {
  if (!ENDPOINT) {
    // No endpoint configured — just surface the report locally.
    // eslint-disable-next-line no-console
    console.warn('[errorReporter]', payload)
    return
  }
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,    // best-effort delivery on unload
    })
  } catch {
    // Don't loop on report failures. Silent drop is intentional.
  }
}

/**
 * Public surface — called by ErrorBoundary.componentDidCatch and by
 * any catch site that wants to flag a non-fatal error.
 */
export function report(
  err: unknown,
  context?: { kind?: ErrorPayload['kind']; meta?: Record<string, unknown> },
): void {
  if (!shouldEmit()) return
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  void send(buildPayload(context?.kind ?? 'runtime', message, stack, context?.meta))
}

/**
 * Mount window-level listeners. Idempotent — calling install() twice
 * is safe.
 */
export function installErrorReporter(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (ev) => {
    if (!shouldEmit()) return
    const message = ev.message || (ev.error instanceof Error ? ev.error.message : 'window.error')
    const stack = ev.error instanceof Error ? ev.error.stack : undefined
    void send(buildPayload('runtime', message, stack, {
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
    }))
  })

  window.addEventListener('unhandledrejection', (ev) => {
    if (!shouldEmit()) return
    const reason = ev.reason
    const message = reason instanceof Error ? reason.message : String(reason ?? 'unhandled rejection')
    const stack = reason instanceof Error ? reason.stack : undefined
    void send(buildPayload('unhandled-rejection', message, stack))
  })
}
