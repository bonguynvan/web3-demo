import type { TimeFrame, ChartType, IndicatorDescriptor } from '@chart-lib/library'
import {
  TrendingUp, BarChart3, ChevronDown, Camera, X, Settings, Save, Upload, Download, Trash2,
} from 'lucide-react'
import { cn } from '../lib/format'
import { TIMEFRAMES, CHART_TYPES, POPULAR_INDICATORS } from '../lib/chartConfig'
import { Dropdown, DropdownItem, DropdownLabel } from './ui/Dropdown'

interface ChartToolbarProps {
  market: string
  activeTimeframe: TimeFrame
  activeChartType: ChartType
  activeIndicators: { instanceId: string; id: string; label: string }[]
  availableIndicators: IndicatorDescriptor[]
  hasStoredLayout: boolean
  onTimeframe: (tf: TimeFrame) => void
  onChartType: (type: ChartType) => void
  onAddIndicator: (id: string) => void
  onRemoveIndicator: (instanceId: string) => void
  onScreenshot: () => void
  onSettings: () => void
  onSaveLayout: () => void
  onLoadLayout: () => void
  onDownloadLayout: () => void
  onUploadLayout: () => void
  onClearLayout: () => void
}

export function ChartToolbar({
  market, activeTimeframe, activeChartType,
  activeIndicators, availableIndicators,
  hasStoredLayout,
  onTimeframe, onChartType,
  onAddIndicator, onRemoveIndicator, onScreenshot, onSettings,
  onSaveLayout, onLoadLayout, onDownloadLayout, onUploadLayout, onClearLayout,
}: ChartToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border text-xs shrink-0">
      <span className="text-text-primary font-medium px-1">{market}</span>
      <Sep />

      {/* Timeframes */}
      {TIMEFRAMES.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => onTimeframe(value)}
          className={cn(
            'px-2 py-1 rounded text-[11px] transition-colors cursor-pointer',
            activeTimeframe === value
              ? 'text-accent bg-accent-dim'
              : 'text-text-muted hover:text-text-primary hover:bg-panel-light'
          )}
        >
          {label}
        </button>
      ))}
      <Sep />

      {/* Chart type */}
      <Dropdown
        trigger={
          <>
            <BarChart3 className="w-3.5 h-3.5" />
            {CHART_TYPES.find(t => t.value === activeChartType)?.label ?? 'Candles'}
            <ChevronDown className="w-3 h-3" />
          </>
        }
      >
        {CHART_TYPES.map(t => (
          <DropdownItem key={t.value} onClick={() => onChartType(t.value)} active={activeChartType === t.value}>
            {t.label}
          </DropdownItem>
        ))}
      </Dropdown>
      <Sep />

      {/* Indicators */}
      <Dropdown
        trigger={
          <>
            <TrendingUp className="w-3.5 h-3.5" />
            Indicators
            {activeIndicators.length > 0 && (
              <span className="bg-accent-dim text-accent text-[9px] px-1 rounded-full">{activeIndicators.length}</span>
            )}
          </>
        }
        width="w-[280px]"
        maxHeight="max-h-[400px]"
      >
        <DropdownLabel>Popular</DropdownLabel>
        {availableIndicators.filter(d => POPULAR_INDICATORS.includes(d.id)).map(d => (
          <DropdownItem key={d.id} onClick={() => onAddIndicator(d.id)}>
            <div className="flex justify-between w-full">
              <span>{d.name}</span>
              <span className="text-[10px] text-text-muted">{d.placement === 'overlay' ? 'overlay' : 'panel'}</span>
            </div>
          </DropdownItem>
        ))}
        <div className="border-t border-border mt-1" onClick={e => e.stopPropagation()}>
          <DropdownLabel>All</DropdownLabel>
        </div>
        {availableIndicators.filter(d => !POPULAR_INDICATORS.includes(d.id)).map(d => (
          <DropdownItem key={d.id} onClick={() => onAddIndicator(d.id)}>
            <div className="flex justify-between w-full">
              <span>{d.name}</span>
              <span className="text-[10px] text-text-muted">{d.placement === 'overlay' ? 'overlay' : 'panel'}</span>
            </div>
          </DropdownItem>
        ))}
      </Dropdown>

      {/* Screenshot + Settings */}
      <ToolBtn onClick={onScreenshot} title="Screenshot"><Camera className="w-3.5 h-3.5" /></ToolBtn>
      <ToolBtn onClick={onSettings} title="Chart Settings"><Settings className="w-3.5 h-3.5" /></ToolBtn>

      {/* Layout — save / load drawings + indicators */}
      <Dropdown
        trigger={
          <>
            <Save className="w-3.5 h-3.5" />
            <ChevronDown className="w-3 h-3" />
          </>
        }
        align="right"
        width="min-w-[180px]"
      >
        <DropdownLabel>Layout</DropdownLabel>
        <DropdownItem onClick={onSaveLayout}>
          <div className="flex items-center gap-2">
            <Save className="w-3.5 h-3.5" />
            Save to browser
          </div>
        </DropdownItem>
        <DropdownItem onClick={onLoadLayout} disabled={!hasStoredLayout}>
          <div className="flex items-center gap-2">
            <Upload className="w-3.5 h-3.5" />
            Load from browser
          </div>
        </DropdownItem>
        <div className="border-t border-border my-1" onClick={e => e.stopPropagation()} />
        <DropdownItem onClick={onDownloadLayout}>
          <div className="flex items-center gap-2">
            <Download className="w-3.5 h-3.5" />
            Download as file
          </div>
        </DropdownItem>
        <DropdownItem onClick={onUploadLayout}>
          <div className="flex items-center gap-2">
            <Upload className="w-3.5 h-3.5" />
            Load from file
          </div>
        </DropdownItem>
        {hasStoredLayout && (
          <>
            <div className="border-t border-border my-1" onClick={e => e.stopPropagation()} />
            <DropdownItem onClick={onClearLayout}>
              <div className="flex items-center gap-2 text-short">
                <Trash2 className="w-3.5 h-3.5" />
                Clear saved layout
              </div>
            </DropdownItem>
          </>
        )}
      </Dropdown>

      <div className="flex-1" />

      {/* Active indicator chips */}
      {activeIndicators.map(ind => (
        <div key={ind.instanceId} className="flex items-center gap-1 bg-accent-dim text-accent text-[10px] px-1.5 py-0.5 rounded">
          <span>{ind.label}</span>
          <button onClick={() => onRemoveIndicator(ind.instanceId)}
            className="hover:text-short transition-colors cursor-pointer">
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function Sep() {
  return <div className="w-px h-4 bg-border mx-0.5" />
}

function ToolBtn({ onClick, active, danger, title, children }: {
  onClick: () => void; active?: boolean; danger?: boolean; title: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'px-1.5 py-1 rounded transition-colors cursor-pointer',
        active ? 'text-accent bg-accent-dim' :
        danger ? 'text-text-muted hover:text-short hover:bg-short-dim' :
        'text-text-muted hover:text-text-primary hover:bg-panel-light'
      )}
    >
      {children}
    </button>
  )
}
