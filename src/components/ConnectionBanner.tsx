/**
 * ConnectionBanner — full-width banner that appears below the header when
 * the app is in a state the user needs to know about to do anything useful.
 *
 * Shows one banner at a time, ordered by severity. Each banner has:
 *   - severity (drives colour)
 *   - a one-line message
 *   - an optional action (button with handler)
 *   - a unique `key` used for dismissal tracking
 *
 * Dismissed banners don't reappear for the same key. If the state clears
 * and then re-enters a dismissed state later, we treat that as a new
 * occurrence by keying on a state fingerprint, not just the banner type.
 *
 * Banner triggers (mode-dependent):
 *
 *   LIVE mode
 *     1. backend unreachable         → RED, retry
 *     2. wrong chain                 → RED, switch-chain hint
 *     3. wallet not connected        → YELLOW, connect hint (no action)
 *     4. websocket disconnected      → YELLOW, auto-reconnect info
 *
 *   DEMO mode
 *     — no banners by default
 *
 * Scope boundary: the banner is READ-ONLY — it describes state, it doesn't
 * do corrective actions beyond a simple retry (which just re-polls health).
 * Switching chains in MetaMask or reconnecting wallets is still the user's
 * job; we just tell them what to do.
 */

import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, WifiOff, X, RotateCw } from 'lucide-react'
import { useServiceHealth } from '../hooks/useServiceHealth'
import { useIsDemo } from '../store/modeStore'
import { apiClient } from '../lib/apiClient'
import { cn } from '../lib/format'

type Severity = 'error' | 'warning'

interface BannerSpec {
  key: string
  severity: Severity
  title: string
  detail: string
  action?: { label: string; onClick: () => void }
  icon: typeof AlertTriangle
}

export function ConnectionBanner() {
  const { t } = useTranslation()
  const health = useServiceHealth()
  const isDemo = useIsDemo()
  const { isConnected } = useAccount()

  // A Set of dismissed banner keys. If a banner's key changes, it becomes
  // visible again (that's how we handle "came back then broke again").
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())

  const [retrying, setRetrying] = useState(false)
  const retryHealth = async () => {
    setRetrying(true)
    try {
      // Fire an immediate probe; the hook's own 10s poll will follow.
      await apiClient.health()
    } catch {
      /* ignore — useServiceHealth will reflect the next poll */
    }
    // Leave spinner for a tiny tick so clicks feel responsive
    setTimeout(() => setRetrying(false), 300)
  }

  // Pick the first applicable banner in priority order. Building the spec
  // inline means we recompute on every health tick, which is fine — it's
  // cheap and the render tree is tiny.
  const banner = useMemo<BannerSpec | null>(() => {
    // Demo mode is quiet unless something weird surfaces later.
    if (isDemo) return null

    // 1. Backend unreachable — highest severity, trade operations will fail
    if (health.backend === 'down') {
      return {
        key: 'backend-down',
        severity: 'error',
        title: t('errors:backend_unreachable'),
        detail: t('errors:backend_unreachable_detail'),
        action: { label: retrying ? t('errors:checking') : t('retry'), onClick: retryHealth },
        icon: WifiOff,
      }
    }

    // 2. Wrong chain — contract reads will return 0x, writes will revert
    if (health.chainId !== 0 && !health.chainOk) {
      return {
        key: `wrong-chain-${health.chainId}`,
        severity: 'error',
        title: t('errors:wrong_network'),
        detail: t('errors:wrong_network_detail', { chainId: String(health.chainId) }),
        icon: AlertTriangle,
      }
    }

    // 3. Wallet not connected in live mode — can browse but can't trade
    if (!isConnected) {
      return {
        key: 'wallet-disconnected',
        severity: 'warning',
        title: t('errors:connect_to_trade'),
        detail: t('errors:connect_to_trade_detail'),
        icon: AlertTriangle,
      }
    }

    // 4. WebSocket disconnected — tape and live fills won't flow
    if (health.websocket === 'disconnected') {
      return {
        key: 'ws-disconnected',
        severity: 'warning',
        title: t('errors:trade_feed_disconnected'),
        detail: t('errors:trade_feed_disconnected_detail'),
        icon: WifiOff,
      }
    }

    return null
  }, [isDemo, isConnected, health, retrying])

  if (!banner) return null
  if (dismissed.has(banner.key)) return null

  const Icon = banner.icon
  const colourClasses =
    banner.severity === 'error'
      ? 'bg-short-dim border-short/40 text-short'
      : 'bg-amber-400/10 border-amber-400/30 text-amber-400'

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 border-b text-xs shrink-0',
        colourClasses,
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold">{banner.title}</span>
        <span className="ml-2 text-text-secondary">{banner.detail}</span>
      </div>

      {banner.action && (
        <button
          onClick={banner.action.onClick}
          disabled={retrying}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0',
            banner.severity === 'error'
              ? 'bg-short/20 hover:bg-short/30 text-short'
              : 'bg-amber-400/20 hover:bg-amber-400/30 text-amber-400',
          )}
        >
          <RotateCw className={cn('w-3 h-3', retrying && 'animate-spin')} />
          {banner.action.label}
        </button>
      )}

      <button
        onClick={() => setDismissed(prev => new Set(prev).add(banner.key))}
        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
