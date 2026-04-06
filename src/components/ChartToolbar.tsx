import type { TimeFrame, ChartType, DrawingToolType, IndicatorDescriptor } from '@chart-lib/library'
import {
  TrendingUp, Pencil, BarChart3, ChevronDown,
  Undo2, Redo2, Camera, Trash2, X, Magnet,
} from 'lucide-react'
import { cn } from '../lib/format'
import { TIMEFRAMES, CHART_TYPES, DRAWING_TOOL_GROUPS, POPULAR_INDICATORS } from '../lib/chartConfig'
import { Dropdown, DropdownItem, DropdownLabel } from './ui/Dropdown'

interface ChartToolbarProps {
  market: string
  activeTimeframe: TimeFrame
  activeChartType: ChartType
  activeTool: DrawingToolType | null
  magnetEnabled: boolean
  activeIndicators: { instanceId: string; id: string; label: string }[]
  availableIndicators: IndicatorDescriptor[]
  onTimeframe: (tf: TimeFrame) => void
  onChartType: (type: ChartType) => void
  onDrawingTool: (tool: DrawingToolType) => void
  onCancelDrawing: () => void
  onToggleMagnet: () => void
  onAddIndicator: (id: string) => void
  onRemoveIndicator: (instanceId: string) => void
  onUndo: () => void
  onRedo: () => void
  onScreenshot: () => void
  onClearDrawings: () => void
}

export function ChartToolbar({
  market, activeTimeframe, activeChartType, activeTool, magnetEnabled,
  activeIndicators, availableIndicators,
  onTimeframe, onChartType, onDrawingTool, onCancelDrawing,
  onToggleMagnet, onAddIndicator, onRemoveIndicator,
  onUndo, onRedo, onScreenshot, onClearDrawings,
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

      {/* Drawing tools */}
      <Dropdown
        trigger={
          <>
            <Pencil className="w-3.5 h-3.5" />
            {activeTool ? DRAWING_TOOL_GROUPS.flatMap(g => g.tools).find(t => t.value === activeTool)?.label ?? 'Drawing' : 'Draw'}
          </>
        }
        active={!!activeTool}
        width="w-[200px]"
        maxHeight="max-h-[400px]"
      >
        {DRAWING_TOOL_GROUPS.map(group => (
          <div key={group.label}>
            <DropdownLabel>{group.label}</DropdownLabel>
            {group.tools.map(tool => (
              <DropdownItem key={tool.value} onClick={() => onDrawingTool(tool.value)} active={activeTool === tool.value}>
                {tool.label}
              </DropdownItem>
            ))}
          </div>
        ))}
      </Dropdown>

      {activeTool && (
        <button onClick={onCancelDrawing}
          className="px-1.5 py-1 rounded text-short hover:bg-short-dim transition-colors cursor-pointer" title="Cancel drawing">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      <Sep />

      {/* Tool buttons */}
      <ToolBtn onClick={onToggleMagnet} active={magnetEnabled} title={magnetEnabled ? 'Magnet ON' : 'Magnet OFF'}>
        <Magnet className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={onUndo} title="Undo"><Undo2 className="w-3.5 h-3.5" /></ToolBtn>
      <ToolBtn onClick={onRedo} title="Redo"><Redo2 className="w-3.5 h-3.5" /></ToolBtn>
      <ToolBtn onClick={onClearDrawings} title="Clear drawings" danger>
        <Trash2 className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={onScreenshot} title="Screenshot"><Camera className="w-3.5 h-3.5" /></ToolBtn>

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
