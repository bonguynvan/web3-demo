/**
 * DevOverlay — floating dev panel to control the price simulator.
 *
 * Toggle simulation, adjust pair count and tick rate, see live FPS + tick stats.
 * Only visible in dev mode.
 */

import { useState } from 'react'
import { Activity, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { cn } from '../lib/format'

interface DevOverlayProps {
  simEnabled: boolean
  onToggleSim: () => void
  pairCount: number
  onPairCount: (n: number) => void
  intervalMs: number
  onIntervalMs: (ms: number) => void
  stats: {
    running: boolean
    pairCount: number
    ticksPerSecond: number
    fps: number
  }
}

const PAIR_PRESETS = [2, 5, 10, 20, 30, 50, 100]
const INTERVAL_PRESETS = [
  { label: '10ms (100/s)', value: 10 },
  { label: '20ms (50/s)', value: 20 },
  { label: '50ms (20/s)', value: 50 },
  { label: '100ms (10/s)', value: 100 },
  { label: '500ms (2/s)', value: 500 },
]

export function DevOverlay({
  simEnabled, onToggleSim,
  pairCount, onPairCount,
  intervalMs, onIntervalMs,
  stats,
}: DevOverlayProps) {
  const [collapsed, setCollapsed] = useState(false)

  const totalTps = stats.ticksPerSecond
  const fpsColor = stats.fps >= 55 ? 'text-long' : stats.fps >= 30 ? 'text-accent' : 'text-short'

  return (
    <div className="fixed bottom-3 left-3 z-50 select-none">
      <div className="bg-panel border border-border rounded-lg shadow-2xl overflow-hidden min-w-[240px]">
        {/* Header — always visible */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center justify-between w-full px-3 py-2 hover:bg-panel-light transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-medium text-text-primary">Dev Panel</span>
            {simEnabled && (
              <span className="flex items-center gap-1 text-[10px] text-long">
                <span className="w-1.5 h-1.5 rounded-full bg-long animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {simEnabled && (
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className={fpsColor}>{stats.fps} FPS</span>
                <span className="text-text-muted">|</span>
                <span className="text-accent">{totalTps} tps</span>
              </div>
            )}
            {collapsed ? <ChevronUp className="w-3 h-3 text-text-muted" /> : <ChevronDown className="w-3 h-3 text-text-muted" />}
          </div>
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
            {/* Sim toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Simulator</span>
              <button
                onClick={onToggleSim}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer',
                  simEnabled
                    ? 'bg-long-dim text-long'
                    : 'bg-surface text-text-muted hover:text-text-primary'
                )}
              >
                <Zap className="w-3 h-3" />
                {simEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {simEnabled && (
              <>
                {/* Pair count */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs text-text-muted">Pairs</span>
                    <span className="text-xs font-mono text-text-primary">{pairCount}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {PAIR_PRESETS.map(n => (
                      <button
                        key={n}
                        onClick={() => onPairCount(n)}
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer',
                          pairCount === n
                            ? 'bg-accent-dim text-accent'
                            : 'bg-surface text-text-muted hover:text-text-primary'
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tick rate */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs text-text-muted">Tick Interval</span>
                    <span className="text-xs font-mono text-text-primary">{intervalMs}ms</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {INTERVAL_PRESETS.map(p => (
                      <button
                        key={p.value}
                        onClick={() => onIntervalMs(p.value)}
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer',
                          intervalMs === p.value
                            ? 'bg-accent-dim text-accent'
                            : 'bg-surface text-text-muted hover:text-text-primary'
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="border-t border-border pt-2 space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-text-muted">Active pairs</span>
                    <span className="font-mono text-text-primary">{stats.pairCount}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-text-muted">Total ticks/sec</span>
                    <span className={cn('font-mono', totalTps > 500 ? 'text-short' : totalTps > 100 ? 'text-accent' : 'text-long')}>
                      {totalTps.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-text-muted">Render FPS</span>
                    <span className={cn('font-mono', fpsColor)}>{stats.fps}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-text-muted">Theoretical tps</span>
                    <span className="font-mono text-text-muted">
                      {Math.round(pairCount * (1000 / intervalMs)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
