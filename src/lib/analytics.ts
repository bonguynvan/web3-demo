/**
 * analytics — minimal, privacy-friendly page/event tracking.
 *
 * No-op unless `VITE_PLAUSIBLE_DOMAIN` is set at build time. When set, loads
 * the official Plausible script tag (cookie-free, GDPR-friendly, no PII) and
 * forwards page views + custom events. Throttled to avoid runaway loops.
 *
 * We deliberately do NOT capture URL query strings, full referrers, or any
 * user-identifying state — only the pathname, which is the same thing a
 * server access log would record.
 */

const DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined
const SCRIPT_SRC =
  (import.meta.env.VITE_PLAUSIBLE_SCRIPT as string | undefined) ??
  'https://plausible.io/js/script.js'

const MAX_EVENTS_PER_MINUTE = 60
const eventTimestamps: number[] = []

type PlausibleFn = (event: string, options?: { props?: Record<string, string | number | boolean> }) => void

declare global {
  interface Window {
    plausible?: PlausibleFn & { q?: unknown[] }
  }
}

let installed = false

function isThrottled(): boolean {
  const now = Date.now()
  const cutoff = now - 60_000
  while (eventTimestamps.length && eventTimestamps[0] < cutoff) {
    eventTimestamps.shift()
  }
  if (eventTimestamps.length >= MAX_EVENTS_PER_MINUTE) return true
  eventTimestamps.push(now)
  return false
}

export function installAnalytics(): void {
  if (installed) return
  installed = true
  if (!DOMAIN || typeof window === 'undefined' || typeof document === 'undefined') return

  // Plausible queue shim so calls made before the script loads still fire.
  window.plausible =
    window.plausible ??
    (((...args: unknown[]) => {
      ;(window.plausible!.q = window.plausible!.q ?? []).push(args)
    }) as unknown as PlausibleFn)

  const s = document.createElement('script')
  s.defer = true
  s.src = SCRIPT_SRC
  s.setAttribute('data-domain', DOMAIN)
  document.head.appendChild(s)
}

export function track(event: string, props?: Record<string, string | number | boolean>): void {
  if (!DOMAIN || typeof window === 'undefined') return
  if (isThrottled()) return
  try {
    window.plausible?.(event, props ? { props } : undefined)
  } catch {
    /* never let analytics break the app */
  }
}

export function trackPageview(): void {
  track('pageview')
}
