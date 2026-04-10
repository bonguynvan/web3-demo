/**
 * useLiquidationAlerts — warn the user before the liquidator keeper fires.
 *
 * The actual force-close lives on-chain: `packages/keepers/src/liquidator.ts`
 * watches positions and calls `PositionManager.liquidatePosition` when
 * they're unhealthy. This hook is purely the early-warning UX — it lets the
 * user close manually (or add collateral) before the keeper acts and
 * charges them the liquidation fee.
 *
 * Two threshold levels:
 *   warning  — price within BUFFER_WARNING% of liquidation
 *   critical — price within BUFFER_CRITICAL% of liquidation
 *
 * Buffer formula: how far the price has to move (as a % of the mark price)
 * before hitting the liquidation line.
 *
 *   long  → (markPrice - liquidationPrice) / markPrice * 100
 *   short → (liquidationPrice - markPrice) / markPrice * 100
 *
 * A toast fires ONCE per transition into a worse level. If you drift back
 * into healthy territory and then cross the line again, a new toast fires.
 * Per-position state is tracked in a ref map keyed by position.key; entries
 * are cleaned up when positions close so the next open starts fresh.
 *
 * Scope boundary: informational only. No auto-close — that would need an
 * explicit opt-in toggle with a confirmation modal so the user can't lose
 * positions to a threshold misconfiguration.
 */

import { useEffect, useRef } from 'react'
import { usePositions, type OnChainPosition } from './usePositions'
import { useToast } from '../store/toastStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatUsd } from '../lib/format'

type HealthLevel = 'healthy' | 'warning' | 'critical'

function computeBufferPercent(pos: OnChainPosition): number {
  if (pos.markPrice <= 0 || pos.liquidationPrice <= 0) return Infinity
  const buffer =
    pos.side === 'long'
      ? (pos.markPrice - pos.liquidationPrice) / pos.markPrice
      : (pos.liquidationPrice - pos.markPrice) / pos.markPrice
  return buffer * 100
}

function classifyHealth(
  bufferPct: number,
  warningPct: number,
  criticalPct: number,
): HealthLevel {
  if (bufferPct <= criticalPct) return 'critical'
  if (bufferPct <= warningPct) return 'warning'
  return 'healthy'
}

/** Only fire a toast when the level gets WORSE, not when it improves. */
function isWorseLevel(next: HealthLevel, prev: HealthLevel): boolean {
  const rank: Record<HealthLevel, number> = { healthy: 0, warning: 1, critical: 2 }
  return rank[next] > rank[prev]
}

export function useLiquidationAlerts(): void {
  const { positions } = usePositions()
  const toast = useToast()
  const warningPct = useSettingsStore(s => s.alertWarningPct)
  const criticalPct = useSettingsStore(s => s.alertCriticalPct)

  // Stable ref so the effect can call the latest toast API without re-running
  // on every toast-store subscription tick.
  const toastRef = useRef(toast)
  toastRef.current = toast

  // Threshold refs so the effect doesn't re-run on every settings tick — the
  // next position update will pick up the new values automatically.
  const warningRef = useRef(warningPct)
  const criticalRef = useRef(criticalPct)
  warningRef.current = warningPct
  criticalRef.current = criticalPct

  // Tracks the last fired health level per position key. Starts at 'healthy'
  // implicitly for new positions; first drop into warning/critical fires.
  const lastLevelRef = useRef<Map<string, HealthLevel>>(new Map())

  useEffect(() => {
    const currentKeys = new Set<string>()

    for (const pos of positions) {
      currentKeys.add(pos.key)

      const buffer = computeBufferPercent(pos)
      const level = classifyHealth(buffer, warningRef.current, criticalRef.current)
      const prev = lastLevelRef.current.get(pos.key) ?? 'healthy'

      if (level !== 'healthy' && level !== prev && isWorseLevel(level, prev)) {
        fireAlert(pos, level, buffer, toastRef.current)
      }

      // Always update so recovery back to healthy is recorded — that way the
      // next dip fires a fresh toast instead of being swallowed.
      lastLevelRef.current.set(pos.key, level)
    }

    // Clean up closed positions so their keys don't leak forever (and so a
    // new position with the same synthetic key gets fresh state).
    for (const key of lastLevelRef.current.keys()) {
      if (!currentKeys.has(key)) {
        lastLevelRef.current.delete(key)
      }
    }
  }, [positions])
}

function fireAlert(
  pos: OnChainPosition,
  level: 'warning' | 'critical',
  bufferPct: number,
  toast: ReturnType<typeof useToast>,
): void {
  const sideLabel = pos.side === 'long' ? 'Long' : 'Short'
  const header = `${pos.market} ${sideLabel}`
  const liqText = `liq $${formatUsd(pos.liquidationPrice)}`
  const bufferText = `${bufferPct.toFixed(1)}% buffer`

  if (level === 'critical') {
    toast.error(
      `${header} — liquidation imminent`,
      `${bufferText} — ${liqText}. Close or add collateral now.`,
    )
  } else {
    toast.warning(
      `${header} at risk`,
      `${bufferText} to ${liqText}.`,
    )
  }
}
