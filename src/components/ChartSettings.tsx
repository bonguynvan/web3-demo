/**
 * ChartSettings — settings panel for chart appearance.
 * Mimics TradingView's chart settings dialog.
 */

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/format'

export interface ChartSettingsState {
  // Candle colors
  candleUpColor: string
  candleDownColor: string
  candleUpWick: string
  candleDownWick: string
  // Background / grid
  backgroundColor: string
  gridColor: string
  gridVisible: boolean
  // Overlays
  volumeVisible: boolean
  legendVisible: boolean
  barCountdown: boolean
  // Scale
  logScale: boolean
  autoScale: boolean
  // Crosshair
  crosshairMode: 'normal' | 'magnet' | 'hidden'
}

export const DEFAULT_SETTINGS: ChartSettingsState = {
  candleUpColor: '#22c55e',
  candleDownColor: '#ef4444',
  candleUpWick: '#22c55e',
  candleDownWick: '#ef4444',
  backgroundColor: '#0f1729',
  gridColor: '#1a2540',
  gridVisible: true,
  volumeVisible: true,
  legendVisible: true,
  barCountdown: true,
  logScale: false,
  autoScale: true,
  crosshairMode: 'magnet',
}

type Tab = 'style' | 'display' | 'scale'

interface ChartSettingsProps {
  open: boolean
  onClose: () => void
  settings: ChartSettingsState
  onChange: (patch: Partial<ChartSettingsState>) => void
  onReset: () => void
}

export function ChartSettings({ open, onClose, settings, onChange, onReset }: ChartSettingsProps) {
  const [tab, setTab] = useState<Tab>('style')

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-h-[80vh] bg-panel border border-border rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-text-primary">Chart Settings</span>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary cursor-pointer transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-2">
          {(['style', 'display', 'scale'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2.5 text-xs font-medium capitalize transition-colors cursor-pointer border-b-2',
                tab === t ? 'text-text-primary border-accent' : 'text-text-muted border-transparent hover:text-text-secondary'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'style' && (
            <>
              <SettingGroup label="Candle Colors">
                <ColorRow label="Up body" value={settings.candleUpColor} onChange={v => onChange({ candleUpColor: v })} />
                <ColorRow label="Down body" value={settings.candleDownColor} onChange={v => onChange({ candleDownColor: v })} />
                <ColorRow label="Up wick" value={settings.candleUpWick} onChange={v => onChange({ candleUpWick: v })} />
                <ColorRow label="Down wick" value={settings.candleDownWick} onChange={v => onChange({ candleDownWick: v })} />
              </SettingGroup>

              <SettingGroup label="Background">
                <ColorRow label="Background" value={settings.backgroundColor} onChange={v => onChange({ backgroundColor: v })} />
                <ColorRow label="Grid lines" value={settings.gridColor} onChange={v => onChange({ gridColor: v })} />
              </SettingGroup>
            </>
          )}

          {tab === 'display' && (
            <>
              <SettingGroup label="Overlays">
                <ToggleRow label="Grid" checked={settings.gridVisible} onChange={v => onChange({ gridVisible: v })} />
                <ToggleRow label="Volume" checked={settings.volumeVisible} onChange={v => onChange({ volumeVisible: v })} />
                <ToggleRow label="OHLC Legend" checked={settings.legendVisible} onChange={v => onChange({ legendVisible: v })} />
                <ToggleRow label="Bar Countdown" checked={settings.barCountdown} onChange={v => onChange({ barCountdown: v })} />
              </SettingGroup>

              <SettingGroup label="Crosshair">
                <SelectRow
                  label="Mode"
                  value={settings.crosshairMode}
                  options={[
                    { value: 'normal', label: 'Normal' },
                    { value: 'magnet', label: 'Magnet' },
                    { value: 'hidden', label: 'Hidden' },
                  ]}
                  onChange={v => onChange({ crosshairMode: v as ChartSettingsState['crosshairMode'] })}
                />
              </SettingGroup>
            </>
          )}

          {tab === 'scale' && (
            <>
              <SettingGroup label="Price Scale">
                <ToggleRow label="Auto Scale" checked={settings.autoScale} onChange={v => onChange({ autoScale: v })} />
                <ToggleRow label="Log Scale" checked={settings.logScale} onChange={v => onChange({ logScale: v })} />
              </SettingGroup>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button
            onClick={onReset}
            className="text-xs text-text-muted hover:text-text-primary cursor-pointer transition-colors"
          >
            Reset to defaults
          </button>
          <button
            onClick={onClose}
            className="text-xs bg-accent text-white px-4 py-1.5 rounded-md hover:bg-accent/80 cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Setting row components ───

function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{label}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent"
        />
        <span className="text-[10px] font-mono text-text-muted w-16">{value}</span>
      </div>
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'w-9 h-5 rounded-full transition-colors cursor-pointer relative',
          checked ? 'bg-accent' : 'bg-surface'
        )}
      >
        <div className={cn(
          'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )} />
      </button>
    </div>
  )
}

function SelectRow({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary cursor-pointer outline-none"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
