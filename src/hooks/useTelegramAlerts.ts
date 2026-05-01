/**
 * useTelegramAlerts — push high-confidence signals to a Telegram chat.
 *
 * Mounted globally in AppShell. Pulls config from localStorage,
 * listens for the config-update event so toggles take effect
 * immediately without a remount. Tracks already-sent signal ids in
 * a ref so the same signal does not fire twice across recompute
 * cycles.
 *
 * Same threshold as the in-app/browser alerts (>=0.6 confidence) so
 * the three delivery channels stay in sync. Phase B2 may diverge
 * thresholds (e.g. only Telegram for >=0.85) but for now they share.
 */

import { useEffect, useRef } from 'react'
import { useSignals } from './useSignals'
import {
  loadTelegramConfig,
  sendTelegramMessage,
  TELEGRAM_CONFIG_EVENT,
  type TelegramConfig,
} from '../lib/telegram'
import type { Signal } from '../signals/types'

const MIN_CONFIDENCE = 0.6

export function useTelegramAlerts(): void {
  const signals = useSignals()
  const sentRef = useRef<Set<string>>(new Set())
  const configRef = useRef<TelegramConfig>(loadTelegramConfig())

  // Keep the config ref fresh on toggle/save.
  useEffect(() => {
    const sync = () => { configRef.current = loadTelegramConfig() }
    window.addEventListener('focus', sync)
    window.addEventListener(TELEGRAM_CONFIG_EVENT, sync)
    return () => {
      window.removeEventListener('focus', sync)
      window.removeEventListener(TELEGRAM_CONFIG_EVENT, sync)
    }
  }, [])

  useEffect(() => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return

    for (const s of signals) {
      if (s.confidence < MIN_CONFIDENCE) continue
      if (sentRef.current.has(s.id)) continue
      sentRef.current.add(s.id)

      // Fire-and-forget — don't await; one slow send shouldn't block
      // the loop. Errors silently fail; the in-app bell already
      // captures every alert as a fallback.
      void sendTelegramMessage(cfg.botToken, cfg.chatId, formatSignal(s))
    }

    // Garbage-collect the dedupe set when it grows
    if (sentRef.current.size > 500) {
      const liveIds = new Set(signals.map(s => s.id))
      sentRef.current = new Set(Array.from(sentRef.current).filter(id => liveIds.has(id)))
    }
  }, [signals])
}

function formatSignal(s: Signal): string {
  const conf = Math.round(s.confidence * 100)
  const arrow = s.direction === 'long' ? '🟢' : '🔴'
  const venueLabel = s.venue.charAt(0).toUpperCase() + s.venue.slice(1)
  return [
    `${arrow} <b>${s.title}</b>`,
    `<b>${s.marketId}</b> · ${s.direction.toUpperCase()} · ${conf}% · ${venueLabel}`,
    s.detail,
  ].join('\n')
}
