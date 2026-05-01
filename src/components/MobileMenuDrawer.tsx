/**
 * MobileMenuDrawer — slide-out drawer for mobile-only top-bar overflow.
 *
 * Hosts mode toggle, theme toggle, settings, about, and the 24h stats grid
 * — bits that don't fit in the slim mobile TopBar but matter for the
 * trader. Desktop puts these in Sidebar instead.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sun, Moon, Settings, HelpCircle } from 'lucide-react'
import { Drawer } from './ui/Drawer'
import { SettingsModal } from './SettingsModal'
import { AboutModal } from './AboutModal'
import { useMarketStats } from '../hooks/useMarketStats'
import type { AppMode } from '../store/modeStore'
import { cn, formatUsd, formatCompact } from '../lib/format'

interface Props {
  open: boolean
  onClose: () => void
  stats: ReturnType<typeof useMarketStats>
  mode: AppMode
  setMode: (m: AppMode) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

export function MobileMenuDrawer({
  open, onClose, stats, mode, setMode, theme, toggleTheme,
}: Props) {
  const { t } = useTranslation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <>
      <Drawer open={open} onClose={onClose} title={t('menu')} widthClass="w-[300px]">
        <div className="p-4 space-y-5">
          <section>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('appearance')}</div>
            <button
              onClick={toggleTheme}
              className="flex items-center justify-between w-full bg-surface hover:bg-panel-light rounded-md px-3 py-2.5 transition-colors cursor-pointer"
            >
              <span className="text-xs text-text-secondary">
                {theme === 'dark' ? t('dark_mode') : t('light_mode')}
              </span>
              {theme === 'dark' ? <Sun className="w-4 h-4 text-text-muted" /> : <Moon className="w-4 h-4 text-text-muted" />}
            </button>
          </section>

          <section>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('preferences')}</div>
            <div className="space-y-1.5">
              <button
                onClick={() => { onClose(); setSettingsOpen(true) }}
                className="flex items-center justify-between w-full bg-surface hover:bg-panel-light rounded-md px-3 py-2.5 transition-colors cursor-pointer"
              >
                <span className="text-xs text-text-secondary">{t('settings')}…</span>
                <Settings className="w-4 h-4 text-text-muted" />
              </button>
              <button
                onClick={() => { onClose(); setAboutOpen(true) }}
                className="flex items-center justify-between w-full bg-surface hover:bg-panel-light rounded-md px-3 py-2.5 transition-colors cursor-pointer"
              >
                <span className="text-xs text-text-secondary">{t('about')}</span>
                <HelpCircle className="w-4 h-4 text-text-muted" />
              </button>
            </div>
          </section>

          <section>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('statistics_24h')}</div>
            <div className="bg-surface/60 rounded-md p-3 space-y-2 text-xs">
              <DrawerStatRow
                label="Change"
                value={stats.statsAvailable
                  ? `${stats.change24h >= 0 ? '+' : ''}${stats.change24h.toFixed(2)}%`
                  : '—'}
                valueClass={stats.statsAvailable
                  ? (stats.change24h >= 0 ? 'text-long' : 'text-short')
                  : 'text-text-muted'}
              />
              <DrawerStatRow label="High" value={stats.statsAvailable ? `$${formatUsd(stats.high24h)}` : '—'} />
              <DrawerStatRow label="Low" value={stats.statsAvailable ? `$${formatUsd(stats.low24h)}` : '—'} />
              <DrawerStatRow label="Volume" value={stats.statsAvailable ? `$${formatCompact(stats.volume24h)}` : '—'} />
              <DrawerStatRow label="Open Interest" value={stats.statsAvailable ? `$${formatCompact(stats.openInterest)}` : '—'} />
              <DrawerStatRow
                label="Funding"
                value={stats.fundingAvailable
                  ? `${stats.fundingRate >= 0 ? '+' : ''}${stats.fundingRate.toFixed(4)}%`
                  : '—'}
                valueClass={stats.fundingAvailable
                  ? (stats.fundingRate >= 0 ? 'text-long' : 'text-short')
                  : 'text-text-muted'}
              />
            </div>
          </section>
        </div>
      </Drawer>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  )
}

function DrawerStatRow({
  label, value, valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className={cn('font-mono tabular-nums', valueClass ?? 'text-text-primary')}>{value}</span>
    </div>
  )
}
