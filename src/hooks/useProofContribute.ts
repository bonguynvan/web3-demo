/**
 * useProofContribute — opt-in upload loop for community-proof rows.
 *
 * Mounted once in AppShell. When the user has toggled the opt-in flag,
 * every UPLOAD_INTERVAL_MS we look at resolved signals from
 * signalPerformanceStore, filter out ones already uploaded (tracked
 * by id in proofContributeStore), and POST a batch to the backend.
 *
 * Inert by default — toggle stays off until the user explicitly opts
 * in on the /proof Community tab.
 */

import { useEffect } from 'react'
import { apiAvailable } from '../api/client'
import { contributeProof, type ContribItem } from '../api/proof'
import { useSignalPerformanceStore } from '../store/signalPerformanceStore'
import { useProofContributeStore } from '../store/proofContributeStore'
import { getDeviceId } from '../store/deviceIdStore'

const UPLOAD_INTERVAL_MS = 2 * 60 * 1000     // 2 minutes
const MAX_BATCH = 100
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000  // backend rejects > 30 days

export function useProofContribute(): void {
  const enabled = useProofContributeStore(s => s.enabled)
  const uploadedIds = useProofContributeStore(s => s.uploadedIds)
  const markUploaded = useProofContributeStore(s => s.markUploaded)
  const resolved = useSignalPerformanceStore(s => s.resolved)

  useEffect(() => {
    if (!apiAvailable() || !enabled) return

    let cancelled = false
    const upload = async () => {
      if (cancelled) return
      const cutoff = Date.now() - MAX_AGE_MS
      const fresh = resolved
        .filter(r => !uploadedIds.has(r.id) && r.closedAt >= cutoff)
        .slice(0, MAX_BATCH)
      if (fresh.length === 0) return

      const contributions: ContribItem[] = fresh.map(r => ({
        source: r.source,
        market_id: r.marketId,
        direction: r.direction,
        hit: r.hit,
        closed_at: new Date(r.closedAt).toISOString(),
      }))
      try {
        const res = await contributeProof({
          device_id: getDeviceId(),
          contributions,
        })
        if (cancelled) return
        if (res.accepted > 0) {
          markUploaded(fresh.map(r => r.id))
        }
      } catch {
        // Silent fail — background sync; will retry next tick.
      }
    }

    void upload()
    const t = setInterval(() => { void upload() }, UPLOAD_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [enabled, resolved, uploadedIds, markUploaded])
}
