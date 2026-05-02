/**
 * Sidebar — desktop left navigation rail.
 *
 * Renders only on md+ breakpoints (≥768px). Mobile keeps the existing
 * hamburger drawer in the header.
 *
 * Two states:
 *   - Expanded (200px): icon + label for each nav item
 *   - Collapsed (60px): icon only, tooltip on hover for labels
 *
 * Contains: logo, page nav, divider, mode toggle, theme, settings, about,
 * and a collapse/expand chevron at the bottom.
 *
 * Collapse state is persisted via settingsStore → localStorage so it
 * survives page refreshes.
 */

import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BarChart3,
  LineChart,
  PieChart,
  BookOpen,
  Sun,
  Moon,
  Settings,
  HelpCircle,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import { useThemeStore } from '../store/themeStore'
import { SettingsModal } from './SettingsModal'
import { AboutModal } from './AboutModal'
import { Tooltip } from './ui/Tooltip'
import { cn } from '../lib/format'

const NAV_ITEMS = [
  { path: '/trade', label: 'Trade', icon: LineChart },
  { path: '/portfolio', label: 'Portfolio', icon: PieChart },
  { path: '/library', label: 'Library', icon: BookOpen },
] as const

export function Sidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const collapsed = useSettingsStore(s => s.sidebarCollapsed)
  const toggleSidebar = useSettingsStore(s => s.toggleSidebar)

  const { theme, toggleTheme } = useThemeStore()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <>
      <aside
        className={cn(
          'hidden md:flex flex-col h-full bg-panel border-r border-border shrink-0 overflow-hidden transition-[width] duration-200',
          collapsed ? 'w-[60px]' : 'w-[200px]',
        )}
      >
        {/* Logo — h-12 matches the TopBar height so the horizontal seam aligns. */}
        <button
          onClick={() => navigate('/')}
          title="Back to TradingDek home"
          className={cn(
            'flex items-center gap-2.5 px-4 h-12 border-b border-border cursor-pointer shrink-0 hover:bg-panel-light transition-colors',
            collapsed && 'justify-center px-0',
          )}
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-accent text-white shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          {!collapsed && (
            <span className="font-bold text-text-primary text-sm tracking-tight">
              Trading<span className="text-accent">Dek</span>
            </span>
          )}
        </button>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col py-2 px-2 gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path
            const Icon = item.icon

            const button = (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'flex items-center gap-2.5 w-full rounded-md transition-colors cursor-pointer relative',
                  collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface',
                )}
              >
                {/* Active left-edge stripe — visual anchor when stacked */}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-accent rounded-r" />
                )}
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <span className="text-xs font-medium">{item.label}</span>
                )}
              </button>
            )

            return collapsed ? (
              <Tooltip key={item.path} content={item.label} side="right">
                {button}
              </Tooltip>
            ) : (
              button
            )
          })}
        </nav>

        {/* Bottom controls */}
        <div className="border-t border-border py-2 px-2 flex flex-col gap-0.5">
          {/* Theme */}
          <SidebarButton
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            collapsed={collapsed}
            onClick={toggleTheme}
          />

          {/* Settings */}
          <SidebarButton
            icon={Settings}
            label="Settings"
            collapsed={collapsed}
            onClick={() => setSettingsOpen(true)}
          />

          {/* About */}
          <SidebarButton
            icon={HelpCircle}
            label="About"
            collapsed={collapsed}
            onClick={() => setAboutOpen(true)}
          />

          {/* Collapse toggle */}
          <SidebarButton
            icon={collapsed ? ChevronsRight : ChevronsLeft}
            label={collapsed ? 'Expand' : 'Collapse'}
            collapsed={collapsed}
            onClick={toggleSidebar}
            className="mt-1 border-t border-border pt-2"
          />
        </div>
      </aside>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  )
}

function SidebarButton({
  icon: Icon,
  label,
  collapsed,
  onClick,
  className,
}: {
  icon: typeof Settings
  label: string
  collapsed: boolean
  onClick: () => void
  className?: string
}) {
  const button = (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 w-full rounded-md text-text-muted hover:text-text-primary hover:bg-surface transition-colors cursor-pointer',
        collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
        className,
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="text-xs">{label}</span>}
    </button>
  )

  return collapsed ? (
    <Tooltip content={label} side="right">{button}</Tooltip>
  ) : (
    button
  )
}
