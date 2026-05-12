/**
 * API client — thin fetch wrapper for the TradingDek backend.
 *
 * Backend base URL comes from VITE_API_BASE. When unset, every call
 * fails fast and callers should hide auth/Pro UI gracefully — the SPA
 * must keep working fully offline.
 *
 * Auth token is persisted to localStorage so reloads stay logged in.
 * On 401 the caller is expected to drop the token and re-prompt.
 */

const RAW_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
const BASE = RAW_BASE.replace(/\/+$/, '')
const TOKEN_KEY = 'tc-auth-token-v1'

export function apiAvailable(): boolean {
  return BASE.length > 0
}

export function apiBase(): string {
  return BASE
}

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage full */ }
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.status = status
    this.body = body
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Send the bearer token if available. Default true. */
  auth?: boolean
  signal?: AbortSignal
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!apiAvailable()) {
    throw new ApiError(0, null, 'backend not configured (VITE_API_BASE unset)')
  }
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false) {
    const tok = getToken()
    if (tok) headers.Authorization = `Bearer ${tok}`
  }
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })
  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try { parsed = JSON.parse(text) } catch { parsed = text }
  }
  if (!res.ok) {
    const msg = typeof parsed === 'object' && parsed !== null && 'error' in parsed
      ? String((parsed as { error: unknown }).error)
      : `HTTP ${res.status}`
    throw new ApiError(res.status, parsed, msg)
  }
  return parsed as T
}
