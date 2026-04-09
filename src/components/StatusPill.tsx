/**
 * StatusPill — compact service-health indicator for the header.
 *
 *   green pulse + "Live"      → everything healthy
 *   yellow    + "Degraded"    → secondary component flaky (WS flapping, etc)
 *   red       + "Offline"     → primary dependency unreachable
 *
 * Click opens a popover showing per-component state, chain id, wallet
 * address, last backend check, and a short explanation of what the
 * current level means. The popover is dismissible by clicking outside
 * or pressing Escape (Dropdown handles this).
 */

import { useMemo } from 'react'
import { Dropdown } from './ui/Dropdown'
import { cn } from '../lib/format'
import {
  useServiceHealth,
  type ServiceHealth,
  type OverallStatus,
  type BackendStatus,
} from '../hooks/useServiceHealth'
import type { WsConnectionState } from '../lib/wsClient'

const LABELS: Record<OverallStatus, string> = {
  up: 'Live',
  degraded: 'Degraded',
  down: 'Offline',
}

const DOT_COLORS: Record<OverallStatus, string> = {
  up: 'bg-long',
  degraded: 'bg-amber-400',
  down: 'bg-short',
}

const TEXT_COLORS: Record<OverallStatus, string> = {
  up: 'text-long',
  degraded: 'text-amber-400',
  down: 'text-short',
}

export function StatusPill() {
  const health = useServiceHealth()

  return (
    <Dropdown
      trigger={
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            {health.overall === 'up' && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-long/60" />
            )}
            <span className={cn('relative inline-flex h-2 w-2 rounded-full', DOT_COLORS[health.overall])} />
          </span>
          <span className={cn('text-[11px] font-medium', TEXT_COLORS[health.overall])}>
            {LABELS[health.overall]}
          </span>
        </div>
      }
      align="right"
      width="min-w-[260px]"
    >
      <HealthPopover health={health} />
    </Dropdown>
  )
}

function HealthPopover({ health }: { health: ServiceHealth }) {
  const explanation = useMemo(() => explainStatus(health), [health])

  return (
    <div
      className="px-3 py-2.5 space-y-2.5"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-muted uppercase tracking-wider">Service Health</span>
        <span className={cn('text-[10px] font-semibold uppercase', TEXT_COLORS[health.overall])}>
          {LABELS[health.overall]}
        </span>
      </div>

      <Row
        label="Backend API"
        value={backendLabel(health.backend)}
        statusClass={backendColor(health.backend)}
      />
      <Row
        label="WebSocket"
        value={wsLabel(health.websocket)}
        statusClass={wsColor(health.websocket)}
      />
      <Row
        label="Chain"
        value={health.chainId === 0 ? 'No wallet' : `${health.chainId}${health.chainOk ? ' (ok)' : ' (wrong)'}`}
        statusClass={health.chainOk || health.chainId === 0 ? 'text-text-secondary' : 'text-short'}
      />
      <Row
        label="Last check"
        value={health.lastCheckedAt ? formatRelative(health.lastCheckedAt) : '—'}
        statusClass="text-text-secondary"
      />

      <div className="pt-2 border-t border-border text-[10px] text-text-muted leading-relaxed">
        {explanation}
      </div>
    </div>
  )
}

function Row({
  label, value, statusClass,
}: {
  label: string
  value: string
  statusClass: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-text-muted">{label}</span>
      <span className={cn('font-mono truncate', statusClass)}>{value}</span>
    </div>
  )
}

// ─── Labels + colours ─────────────────────────────────────────────────────

function backendLabel(status: BackendStatus): string {
  switch (status) {
    case 'up': return 'Reachable'
    case 'down': return 'Unreachable'
    case 'unknown': return 'Checking…'
  }
}

function backendColor(status: BackendStatus): string {
  switch (status) {
    case 'up': return 'text-long'
    case 'down': return 'text-short'
    case 'unknown': return 'text-text-muted'
  }
}

function wsLabel(state: WsConnectionState): string {
  switch (state) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting…'
    case 'disconnected': return 'Disconnected'
    case 'idle': return 'Not in use'
  }
}

function wsColor(state: WsConnectionState): string {
  switch (state) {
    case 'connected': return 'text-long'
    case 'connecting': return 'text-amber-400'
    case 'disconnected': return 'text-short'
    case 'idle': return 'text-text-muted'
  }
}

function explainStatus(h: ServiceHealth): string {
  if (h.overall === 'down') {
    if (h.backend === 'down') {
      return 'The backend API is unreachable. Live mode data will not update until it comes back.'
    }
    if (!h.chainOk && h.chainId !== 0) {
      return `Your wallet is on chain ${h.chainId} but this app expects chain 31337 (Anvil). Switch networks to trade.`
    }
    return 'One or more critical services are unreachable.'
  }

  if (h.overall === 'degraded') {
    if (h.websocket === 'disconnected') {
      return 'WebSocket is disconnected. Trades and prices will reconnect automatically.'
    }
    if (h.websocket === 'connecting') {
      return 'WebSocket is reconnecting. Live updates will resume shortly.'
    }
    if (h.backend === 'unknown') {
      return 'Waiting for the first backend health check…'
    }
    if (!h.chainOk && h.chainId !== 0) {
      return `Wallet on chain ${h.chainId}. Live mode needs chain 31337 — switch to trade on-chain.`
    }
    return 'Secondary services are flaky. Core functionality still works.'
  }

  return 'All systems operational.'
}

function formatRelative(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}
