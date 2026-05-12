/**
 * ScrollToTop — restores scroll position to (0, 0) on every route
 * change. Mounted once inside <BrowserRouter> in App.tsx.
 *
 * Routes that need to preserve their own scroll state (e.g. an
 * infinite list with deep-linked scroll position) should manage it
 * themselves; this is the global default for the marketing + public
 * surfaces where landing on a mid-page scroll is jarring.
 */

import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function ScrollToTop() {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    // Use instant behaviour — animated scrolling on every nav feels janky
    // and competes with the route transition itself.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return null
}
