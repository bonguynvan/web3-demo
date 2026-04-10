/**
 * useBreakpoint — observable viewport breakpoint hook.
 *
 * Three buckets, matching the project's existing Tailwind usage:
 *   - mobile  : < 768px      (`md:` breakpoint)
 *   - tablet  : 768–1279px   (between `md:` and `xl:`)
 *   - desktop : ≥ 1280px     (`xl:` and up — current trading layout)
 *
 * Notes:
 *   - Single window-wide listener via `matchMedia` instead of polling
 *     `window.innerWidth` on every resize event. matchMedia only fires
 *     when the active bucket actually changes, so we re-render at most
 *     twice during a typical phone-to-tablet rotation.
 *   - Hydration-safe initial value: returns 'desktop' on the server (and
 *     during the first client render) and updates synchronously after
 *     mount. For this app it's a fine default — the trading desktop
 *     layout is the canonical view, and a brief flash to mobile after
 *     hydration is acceptable since we don't ship SSR.
 *   - Two thin convenience wrappers (`useIsMobile`, `useIsDesktop`) so
 *     consumers don't have to memoise the comparison themselves.
 */

import { useEffect, useState } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

const MOBILE_QUERY = '(max-width: 767px)'
const DESKTOP_QUERY = '(min-width: 1280px)'

function detectBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop'
  if (window.matchMedia(MOBILE_QUERY).matches) return 'mobile'
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop'
  return 'tablet'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(detectBreakpoint)

  useEffect(() => {
    const mobileMql = window.matchMedia(MOBILE_QUERY)
    const desktopMql = window.matchMedia(DESKTOP_QUERY)

    const update = () => setBp(detectBreakpoint())

    // matchMedia change events fire only on threshold crossings, which is
    // exactly what we want — no spam during a slow window resize.
    mobileMql.addEventListener('change', update)
    desktopMql.addEventListener('change', update)

    // Sync once on mount in case the SSR-friendly initial value was wrong.
    update()

    return () => {
      mobileMql.removeEventListener('change', update)
      desktopMql.removeEventListener('change', update)
    }
  }, [])

  return bp
}

export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile'
}

export function useIsDesktop(): boolean {
  return useBreakpoint() === 'desktop'
}
