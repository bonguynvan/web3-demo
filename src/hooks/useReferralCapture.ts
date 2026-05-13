/**
 * useReferralCapture — reads `?ref=<userId>` from the URL on first
 * paint and stores it in the referralStore.
 *
 * Mounted once at the root (App.tsx) so it sees every landing path.
 * After capture, the param is scrubbed from the URL with replaceState
 * — the user's address bar stays clean even after they navigate
 * deeper.
 *
 * Idempotent: subsequent captures from the same incoming URL would
 * just overwrite with the same value.
 */

import { useEffect } from 'react'
import { useReferralStore } from '../store/referralStore'

const MAX_REF_LEN = 64

export function useReferralCapture(): void {
  const capture = useReferralStore(s => s.capture)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const ref = url.searchParams.get('ref')
    if (!ref) return
    if (ref.length === 0 || ref.length > MAX_REF_LEN) return
    capture(ref)
    url.searchParams.delete('ref')
    const clean = url.pathname + (url.search ? `?${url.searchParams}` : '') + url.hash
    window.history.replaceState(null, '', clean)
  }, [capture])
}
