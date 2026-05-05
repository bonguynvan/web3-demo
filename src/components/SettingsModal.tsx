/**
 * SettingsModal — central place for user-controllable preferences.
 *
 * Sections:
 *   1. Appearance — theme toggle (mirrors the header / drawer affordance)
 *   2. Liquidation alerts — sliders for warning + critical buffer %
 *   3. Reset — destructive actions (chart layout, demo state, all client data)
 *
 * The reset buttons each show their own confirmation step (click → "are you
 * sure?" → click again → done) so a stray tap doesn't wipe state.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, RotateCcw, Sun, Moon, AlertTriangle, Globe, Download, Upload } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useSettingsStore } from '../store/settingsStore'
import { useThemeStore } from '../store/themeStore'
import { clearClientStateStorage } from '../lib/demoData'
import { clearStoredLayout } from '../lib/chartLayout'
import { useRiskStore } from '../store/riskStore'
import { downloadBackup, importBackup } from '../lib/userBackup'
import { useToast } from '../store/toastStore'
import { cn } from '../lib/format'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  // Add new languages here:
  // { code: 'vi', label: 'Tiếng Việt' },
  // { code: 'zh', label: '中文' },
  // { code: 'ja', label: '日本語' },
  // { code: 'ko', label: '한국어' },
] as const

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { i18n } = useTranslation()
  const theme = useThemeStore(s => s.theme)
  const toggleTheme = useThemeStore(s => s.toggleTheme)
  const warningPct = useSettingsStore(s => s.alertWarningPct)
  const criticalPct = useSettingsStore(s => s.alertCriticalPct)
  const setWarningPct = useSettingsStore(s => s.setAlertWarningPct)
  const setCriticalPct = useSettingsStore(s => s.setAlertCriticalPct)
  const resetSettings = useSettingsStore(s => s.reset)
  const toast = useToast()
  const dailyPnlCapUsd = useRiskStore(s => s.dailyPnlCapUsd)
  const maxDrawdownUsd = useRiskStore(s => s.maxDrawdownUsd)
  const maxExposureUsd = useRiskStore(s => s.maxExposureUsd)
  const setRiskLimits = useRiskStore(s => s.setLimits)
  const riskBreach = useRiskStore(s => s.breach)

  return (
    <Modal open={open} onClose={onClose} title="Settings" maxWidth="max-w-lg">
      <div className="space-y-5">
        {/* Appearance */}
        <Section title="Appearance">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between w-full bg-surface hover:bg-panel-light rounded-md px-3 py-2.5 transition-colors cursor-pointer"
          >
            <span className="text-xs text-text-secondary">
              {theme === 'dark' ? 'Dark' : 'Light'} mode
            </span>
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-text-muted" />
            ) : (
              <Moon className="w-4 h-4 text-text-muted" />
            )}
          </button>
        </Section>

        {/* Language */}
        <Section title="Language">
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-md text-xs transition-colors cursor-pointer',
                  i18n.language === lang.code
                    ? 'bg-accent text-white'
                    : 'bg-surface text-text-muted hover:text-text-primary border border-border',
                )}
              >
                <Globe className="w-3 h-3" />
                {lang.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Liquidation alerts */}
        <Section
          title="Liquidation alerts"
          subtitle="Buffer % between mark price and liquidation price at which toasts fire."
        >
          <SliderRow
            label="Warning threshold"
            value={warningPct}
            min={5}
            max={50}
            step={1}
            unit="%"
            onChange={setWarningPct}
            colorClass="accent-amber-400"
          />
          <SliderRow
            label="Critical threshold"
            value={criticalPct}
            min={1}
            max={20}
            step={0.5}
            unit="%"
            onChange={setCriticalPct}
            colorClass="accent-short"
          />
          {criticalPct >= warningPct && (
            <div className="flex items-start gap-2 text-[10px] text-amber-400 px-2 py-1.5 bg-amber-400/10 border border-amber-400/30 rounded">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                Critical threshold should be lower than warning threshold so the
                two alerts fire in order. Adjust the values to fix this.
              </span>
            </div>
          )}
        </Section>

        {/* Risk caps */}
        <Section
          title="Risk caps"
          subtitle="Portfolio-level guardrails. When any cap is breached, every bot is auto-paused and a toast fires. 0 disables that cap."
        >
          <SliderRow
            label="Daily loss cap"
            value={dailyPnlCapUsd}
            min={0}
            max={1000}
            step={10}
            unit="$"
            onChange={(v) => setRiskLimits({ dailyPnlCapUsd: v })}
            colorClass="accent-short"
          />
          <SliderRow
            label="Max drawdown"
            value={maxDrawdownUsd}
            min={0}
            max={2000}
            step={25}
            unit="$"
            onChange={(v) => setRiskLimits({ maxDrawdownUsd: v })}
            colorClass="accent-amber-400"
          />
          <SliderRow
            label="Max open exposure"
            value={maxExposureUsd}
            min={0}
            max={5000}
            step={50}
            unit="$"
            onChange={(v) => setRiskLimits({ maxExposureUsd: v })}
            colorClass="accent-accent"
          />
          {riskBreach && (
            <div className="flex items-start gap-2 text-[10px] text-short px-2 py-1.5 bg-short/10 border border-short/30 rounded">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                Bots paused — {riskBreach.reason}. Raise a cap or wait for
                tomorrow's PnL window to clear it automatically.
              </span>
            </div>
          )}
        </Section>

        {/* Backup */}
        <Section
          title="Backup"
          subtitle="Migrate bots, signal settings, thresholds, and performance history across browsers."
        >
          <div className="flex gap-2">
            <button
              onClick={() => {
                downloadBackup()
                toast.success('Backup downloaded', 'Save the file somewhere safe')
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export backup
            </button>
            <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Import backup
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const text = await file.text()
                  const result = importBackup(text)
                  if (result.ok) {
                    toast.success('Backup imported', `${result.imported ?? 0} keys restored — reload to apply`)
                  } else {
                    toast.error('Import failed', result.error ?? 'Unknown error')
                  }
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </Section>

        {/* Reset */}
        <Section
          title="Reset"
          subtitle="Destructive — clears local state in this browser only. Venue accounts and server data are untouched."
        >
          <ResetButton
            label="Clear chart layout"
            description="Removes saved drawings, indicators, and visual customisations."
            onConfirm={() => {
              clearStoredLayout()
              toast.success('Chart layout cleared', 'Reload the page to reset the chart')
            }}
          />
          <ResetButton
            label="Wipe all client storage"
            description="Clears bots, signal settings, performance history, and saved preferences. Same effect as DevTools → Application → Clear storage."
            onConfirm={() => {
              clearClientStateStorage()
              clearStoredLayout()
              resetSettings()
              toast.success('Client storage wiped', 'Reload the page to start fresh')
            }}
            destructive
          />
        </Section>
      </div>
    </Modal>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">{title}</div>
      {subtitle && (
        <div className="text-[10px] text-text-muted leading-relaxed mb-2.5">{subtitle}</div>
      )}
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  colorClass,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
  colorClass: string
}) {
  return (
    <div className="bg-surface/60 rounded-md px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-sm font-mono font-semibold text-text-primary">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={cn('w-full h-1 cursor-pointer', colorClass)}
      />
    </div>
  )
}

/**
 * Two-step destructive button. First click flips into a confirmation state
 * for 4s; clicking again within that window fires the action. Click outside
 * or wait → reverts. Prevents accidental wipes from a stray click.
 */
function ResetButton({
  label,
  description,
  onConfirm,
  destructive,
}: {
  label: string
  description: string
  onConfirm: () => void
  destructive?: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  const handleClick = () => {
    if (confirming) {
      onConfirm()
      setConfirming(false)
      return
    }
    setConfirming(true)
    setTimeout(() => setConfirming(false), 4000)
  }

  return (
    <div className="bg-surface/60 rounded-md px-3 py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs text-text-secondary font-medium">{label}</div>
        <div className="text-[10px] text-text-muted leading-relaxed mt-0.5">{description}</div>
      </div>
      <button
        onClick={handleClick}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium border transition-colors cursor-pointer shrink-0',
          confirming
            ? 'border-short bg-short text-white hover:bg-short/90'
            : destructive
              ? 'border-short/40 text-short hover:bg-short/10'
              : 'border-border text-text-muted hover:text-text-primary hover:bg-panel-light',
        )}
      >
        {confirming ? <Trash2 className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
        {confirming ? 'Confirm' : 'Reset'}
      </button>
    </div>
  )
}
