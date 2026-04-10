/**
 * DrawToolsSidebar — vertical drawing tools panel on the left side of the chart.
 * Mimics TradingView's left sidebar layout.
 *
 * Tools are organized in groups with expandable sub-menus on hover.
 */

import { useState } from 'react'
import type { DrawingToolType } from '@tradecanvas/chart'
import {
  TrendingUp, Minus, PenLine, ArrowUpRight, MoveRight,
  Square, Circle, Triangle, GitBranch,
  Ruler, Type, ArrowRight, Hash, Magnet,
  MousePointer, Undo2, Redo2, Trash2,
} from 'lucide-react'
import { cn } from '../lib/format'

interface DrawToolsSidebarProps {
  activeTool: DrawingToolType | null
  magnetEnabled: boolean
  onDrawingTool: (tool: DrawingToolType) => void
  onCancelDrawing: () => void
  onToggleMagnet: () => void
  onUndo: () => void
  onRedo: () => void
  onClearDrawings: () => void
}

// Tool groups with icons — each group shows the "primary" tool icon,
// hovering reveals the full sub-menu
interface ToolGroup {
  icon: React.ReactNode
  label: string
  tools: { label: string; value: DrawingToolType }[]
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    icon: <TrendingUp className="w-4 h-4" />,
    label: 'Lines',
    tools: [
      { label: 'Trend Line', value: 'trendLine' },
      { label: 'Ray', value: 'ray' },
      { label: 'Extended Line', value: 'extendedLine' },
    ],
  },
  {
    icon: <Minus className="w-4 h-4" />,
    label: 'Horizontal/Vertical',
    tools: [
      { label: 'Horizontal Line', value: 'horizontalLine' },
      { label: 'Vertical Line', value: 'verticalLine' },
    ],
  },
  {
    icon: <PenLine className="w-4 h-4" />,
    label: 'Channels',
    tools: [
      { label: 'Parallel Channel', value: 'parallelChannel' },
      { label: 'Regression Channel', value: 'regressionChannel' },
    ],
  },
  {
    icon: <Hash className="w-4 h-4" />,
    label: 'Fibonacci',
    tools: [
      { label: 'Fib Retracement', value: 'fibRetracement' },
      { label: 'Fib Extension', value: 'fibExtension' },
    ],
  },
  {
    icon: <Square className="w-4 h-4" />,
    label: 'Shapes',
    tools: [
      { label: 'Rectangle', value: 'rectangle' },
      { label: 'Ellipse', value: 'ellipse' },
      { label: 'Triangle', value: 'triangle' },
    ],
  },
  {
    icon: <GitBranch className="w-4 h-4" />,
    label: 'Gann & Advanced',
    tools: [
      { label: 'Pitchfork', value: 'pitchfork' },
      { label: 'Gann Fan', value: 'gannFan' },
      { label: 'Gann Box', value: 'gannBox' },
      { label: 'Elliott Wave', value: 'elliottWave' },
    ],
  },
  {
    icon: <Ruler className="w-4 h-4" />,
    label: 'Measure',
    tools: [
      { label: 'Price Range', value: 'priceRange' },
      { label: 'Date Range', value: 'dateRange' },
      { label: 'Measure', value: 'measure' },
    ],
  },
  {
    icon: <Type className="w-4 h-4" />,
    label: 'Annotation',
    tools: [
      { label: 'Text', value: 'text' },
      { label: 'Arrow', value: 'arrow' },
    ],
  },
]

export function DrawToolsSidebar({
  activeTool, magnetEnabled,
  onDrawingTool, onCancelDrawing, onToggleMagnet,
  onUndo, onRedo, onClearDrawings,
}: DrawToolsSidebarProps) {
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null)

  // Check if the active tool belongs to a group
  const activeGroupIdx = TOOL_GROUPS.findIndex(g =>
    g.tools.some(t => t.value === activeTool)
  )

  return (
    <div className="flex flex-col w-9 bg-panel border-r border-border py-1 shrink-0">
      {/* Cursor (deselect tool) */}
      <SidebarBtn
        active={activeTool === null}
        onClick={onCancelDrawing}
        title="Cursor"
      >
        <MousePointer className="w-3.5 h-3.5" />
      </SidebarBtn>

      <div className="w-5 h-px bg-border mx-auto my-1" />

      {/* Tool groups */}
      {TOOL_GROUPS.map((group, idx) => (
        <div
          key={idx}
          className="relative"
          onMouseEnter={() => setHoveredGroup(idx)}
          onMouseLeave={() => setHoveredGroup(null)}
        >
          <SidebarBtn
            active={activeGroupIdx === idx}
            onClick={() => onDrawingTool(group.tools[0].value)}
            title={group.label}
          >
            {group.icon}
            {/* Small dot indicator for multi-tool groups */}
            {group.tools.length > 1 && (
              <div className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-text-muted" />
            )}
          </SidebarBtn>

          {/* Flyout sub-menu */}
          {hoveredGroup === idx && group.tools.length > 1 && (
            <div className="absolute left-full top-0 ml-0.5 bg-panel border border-border rounded-lg shadow-2xl z-30 py-1 min-w-[160px]">
              <div className="px-2.5 py-1 text-[10px] text-text-muted uppercase tracking-wider">{group.label}</div>
              {group.tools.map(tool => (
                <button
                  key={tool.value}
                  onClick={() => { onDrawingTool(tool.value); setHoveredGroup(null) }}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 text-xs transition-colors cursor-pointer',
                    activeTool === tool.value ? 'text-accent bg-accent-dim' : 'text-text-secondary hover:bg-panel-light'
                  )}
                >
                  {tool.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex-1" />

      {/* Bottom tools */}
      <div className="w-5 h-px bg-border mx-auto my-1" />

      <SidebarBtn
        active={magnetEnabled}
        onClick={onToggleMagnet}
        title={magnetEnabled ? 'Magnet ON' : 'Magnet OFF'}
      >
        <Magnet className="w-3.5 h-3.5" />
      </SidebarBtn>

      <SidebarBtn onClick={onUndo} title="Undo">
        <Undo2 className="w-3.5 h-3.5" />
      </SidebarBtn>

      <SidebarBtn onClick={onRedo} title="Redo">
        <Redo2 className="w-3.5 h-3.5" />
      </SidebarBtn>

      <SidebarBtn onClick={onClearDrawings} title="Clear all" danger>
        <Trash2 className="w-3.5 h-3.5" />
      </SidebarBtn>
    </div>
  )
}

function SidebarBtn({ onClick, active, danger, title, children }: {
  onClick: () => void; active?: boolean; danger?: boolean; title: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'relative flex items-center justify-center w-9 h-8 transition-colors cursor-pointer',
        active ? 'text-accent bg-accent-dim' :
        danger ? 'text-text-muted hover:text-short hover:bg-short-dim' :
        'text-text-muted hover:text-text-primary hover:bg-panel-light'
      )}
    >
      {children}
    </button>
  )
}
