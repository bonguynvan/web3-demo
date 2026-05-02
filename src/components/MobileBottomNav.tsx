/**
 * MobileBottomNav — sticky bottom-tab navigation for mobile.
 *
 * Sidebar is desktop-only (md+). Without this component, mobile users
 * have no way to switch between Trade and Portfolio. Sits below any
 * page-level sticky CTA (e.g. MobileTradeLayout's Long/Short bar).
 *
 * Safe-area-inset-bottom keeps clear of the iOS home indicator.
 */

import { useLocation, useNavigate } from 'react-router-dom'
import { LineChart, PieChart, BookOpen } from 'lucide-react'
import { cn } from '../lib/format'

const TABS = [
  { path: '/trade', label: 'Trade', icon: LineChart },
  { path: '/portfolio', label: 'Portfolio', icon: PieChart },
  { path: '/library', label: 'Library', icon: BookOpen },
] as const

export function MobileBottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav
      className="md:hidden flex items-stretch shrink-0 bg-panel border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(tab => {
        const isActive = location.pathname === tab.path
        const Icon = tab.icon
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors cursor-pointer relative',
              isActive ? 'text-accent' : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {isActive && (
              <span className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-accent rounded-b" />
            )}
            <Icon className="w-4 h-4" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
