/**
 * deviceIdStore — stable anonymous client identifier.
 *
 * Generated once on first visit, persisted to localStorage at
 * `tc-device-v1`, never sent to a server (we don't have one). Used
 * today to stamp exported bots so authorship can be re-claimed when
 * real auth lands. Future uses: cross-tab identity, support tickets,
 * opt-in aggregate proof telemetry.
 *
 * This is NOT user identity. It's a per-browser fingerprint that
 * doesn't try to be unique across devices, doesn't carry any PII,
 * and disappears when the user clears storage. Treat it as a stable
 * cookie for a one-user product.
 */

import { create } from 'zustand'

const STORAGE_KEY = 'tc-device-v1'

interface DeviceRecord {
  id: string
  createdAt: number
}

function generateUuid(): string {
  // Prefer the platform RNG; fall back to Math.random for ancient browsers.
  // The fallback is good enough for a non-cryptographic identifier — we
  // are not deriving keys or auth from this value.
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function load(): DeviceRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.id === 'string' && parsed.id.length > 0) {
        return {
          id: parsed.id,
          createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
        }
      }
    }
  } catch { /* fallthrough — generate fresh */ }

  const fresh: DeviceRecord = { id: generateUuid(), createdAt: Date.now() }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)) } catch { /* full */ }
  return fresh
}

interface DeviceIdStore {
  id: string
  createdAt: number
  reset: () => void
}

const initial = load()

export const useDeviceIdStore = create<DeviceIdStore>((set) => ({
  id: initial.id,
  createdAt: initial.createdAt,
  reset: () => {
    const fresh: DeviceRecord = { id: generateUuid(), createdAt: Date.now() }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)) } catch { /* full */ }
    set(fresh)
  },
}))

/**
 * Synchronous getter for non-hook contexts (export helpers, one-off
 * sigs). Always returns a stable id for the lifetime of the page.
 */
export function getDeviceId(): string {
  return useDeviceIdStore.getState().id
}

/**
 * Short user-facing rendering of the device id — first 7 hex chars of
 * the UUID prefixed with `tdk-`. Use for "your client id" support
 * lines on /profile.
 */
export function getShortDeviceId(): string {
  return `tdk-${getDeviceId().replace(/-/g, '').slice(0, 7)}`
}
