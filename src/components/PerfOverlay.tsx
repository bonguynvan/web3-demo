import { useEffect, useState } from 'react'
import { perfMonitor, type PerfSnapshot } from '../lib/perfMonitor'
import { cn } from '../lib/format'

export function PerfOverlay() {
  const [snapshot, setSnapshot] = useState<PerfSnapshot | null>(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    perfMonitor.start()
    const unsub = perfMonitor.subscribe(setSnapshot)
    return () => {
      unsub()
      perfMonitor.stop()
    }
  }, [])

  if (!snapshot) return null

  const fpsColor = snapshot.fps >= 55 ? 'text-long' : snapshot.fps >= 30 ? 'text-yellow-400' : 'text-short'

  return (
    <div className="fixed top-[60px] right-2 z-40 font-mono text-[11px] select-none">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'px-2 py-1 rounded-t cursor-pointer',
          'bg-panel border border-border border-b-0',
          fpsColor
        )}
      >
        {snapshot.fps} FPS
      </button>

      {expanded && (
        <div className="bg-panel/95 backdrop-blur border border-border rounded-b rounded-tr p-3 space-y-2 min-w-[240px]">
          {/* Core Metrics */}
          <div className="space-y-1">
            <Row label="FPS" value={`${snapshot.fps}`} color={fpsColor} />
            <Row label="Frame time" value={`${snapshot.frameTime}ms`}
              color={snapshot.frameTime < 16.67 ? 'text-long' : 'text-short'} />
            <Row label="Dropped frames" value={`${snapshot.droppedFrames}`}
              color={snapshot.droppedFrames === 0 ? 'text-long' : 'text-short'} />
            <Row label="State updates/s" value={`${snapshot.updatesPerSec}`}
              color={snapshot.updatesPerSec < 100 ? 'text-text-secondary' : 'text-yellow-400'} />
            {snapshot.memoryMB > 0 && (
              <Row label="Memory" value={`${snapshot.memoryMB} MB`}
                color={snapshot.memoryMB < 100 ? 'text-text-secondary' : 'text-yellow-400'} />
            )}
          </div>

          {/* Per-component renders */}
          {Object.keys(snapshot.rendersPerSec).length > 0 && (
            <div className="border-t border-border pt-2">
              <div className="text-text-muted mb-1">Renders/sec by component:</div>
              {Object.entries(snapshot.rendersPerSec)
                .sort(([, a], [, b]) => b - a)
                .map(([name, count]) => (
                  <Row key={name} label={name} value={`${count}`}
                    color={count > 60 ? 'text-short' : count > 10 ? 'text-yellow-400' : 'text-long'} />
                ))
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      <span className={color || 'text-text-secondary'}>{value}</span>
    </div>
  )
}
