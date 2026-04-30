/**
 * useSignalAlerts — fires browser notifications + adds entries to the
 * in-app notification bell when high-confidence signals appear.
 *
 * Mounted globally in AppShell so alerts fire even when the user is
 * not on the Signals tab. Tracks already-alerted signal ids in a ref
 * to avoid double-firing across recompute cycles.
 *
 * The "enabled" flag is read from localStorage and updated by
 * SignalsPanel's toggle. We re-read on focus + on the custom event
 * `signal-alerts-toggle` so the toggle takes effect immediately
 * without a full reload.
 */

import { useEffect, useRef } from 'react'
import { useSignals } from './useSignals'
import { useNotificationStore } from '../store/notificationStore'
import type { Signal } from '../signals/types'

export const ALERT_ENABLED_KEY = 'signal-alerts-enabled'
export const ALERT_TOGGLE_EVENT = 'signal-alerts-toggle'
const MIN_CONFIDENCE = 0.6

function readEnabled(): boolean {
  try { return localStorage.getItem(ALERT_ENABLED_KEY) === 'true' } catch { return false }
}

export function useSignalAlerts(): void {
  const signals = useSignals()
  const addNotification = useNotificationStore(s => s.add)
  const alertedRef = useRef<Set<string>>(new Set())
  const enabledRef = useRef<boolean>(readEnabled())

  // Keep the enabled flag in sync without re-running the alert loop
  useEffect(() => {
    const sync = () => { enabledRef.current = readEnabled() }
    window.addEventListener('focus', sync)
    window.addEventListener(ALERT_TOGGLE_EVENT, sync)
    return () => {
      window.removeEventListener('focus', sync)
      window.removeEventListener(ALERT_TOGGLE_EVENT, sync)
    }
  }, [])

  useEffect(() => {
    if (!enabledRef.current) return

    for (const s of signals) {
      if (s.confidence < MIN_CONFIDENCE) continue
      if (alertedRef.current.has(s.id)) continue
      alertedRef.current.add(s.id)

      // Always add to in-app bell so the user has history regardless
      // of OS notification permission state.
      addNotification({
        type: 'alert',
        title: s.title,
        message: alertMessage(s),
      })

      // Best-effort browser notification
      maybeFireBrowserNotification(s)
    }

    // Garbage-collect alerted ids that have aged out of the live feed
    if (alertedRef.current.size > 200) {
      const liveIds = new Set(signals.map(s => s.id))
      alertedRef.current = new Set(Array.from(alertedRef.current).filter(id => liveIds.has(id)))
    }
  }, [signals, addNotification])
}

function alertMessage(s: Signal): string {
  const conf = Math.round(s.confidence * 100)
  return `${s.marketId} · ${s.direction.toUpperCase()} · ${conf}% conf — ${s.detail}`
}

function maybeFireBrowserNotification(s: Signal): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(s.title, {
      body: alertMessage(s),
      tag: s.id,                  // dedup if the same signal fires twice
    })
  } catch {
    // Some browsers throw on closed-tab notifications; ignore.
  }
}

/** Toggle alerts on/off; requests permission on first enable. */
export async function setSignalAlertsEnabled(next: boolean): Promise<boolean> {
  if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    await Notification.requestPermission()
    // We accept whatever the user picks; in-app bell still works
    // even when OS notifications are denied.
  }
  try { localStorage.setItem(ALERT_ENABLED_KEY, String(next)) } catch { /* full */ }
  window.dispatchEvent(new Event(ALERT_TOGGLE_EVENT))
  return next
}

export function getSignalAlertsEnabled(): boolean {
  return readEnabled()
}
