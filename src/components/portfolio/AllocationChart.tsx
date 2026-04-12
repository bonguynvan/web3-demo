/**
 * AllocationChart — pure SVG donut chart for portfolio allocation.
 *
 * No chart library needed — uses stroke-dasharray technique.
 */

import type { AllocationSegment } from '../../hooks/usePortfolioData'
import { formatUsd } from '../../lib/format'

interface AllocationChartProps {
  segments: AllocationSegment[]
  total: number
}

export function AllocationChart({ segments, total }: AllocationChartProps) {
  if (segments.length === 0 || total <= 0) {
    return (
      <div className="flex items-center justify-center h-32 text-text-muted text-xs">
        No allocation data
      </div>
    )
  }

  const size = 120
  const strokeWidth = 20
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2

  let accumulatedOffset = 0

  return (
    <div className="flex items-center gap-4">
      {/* Donut */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {/* Background ring */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-surface"
        />
        {/* Segments */}
        {segments.map((seg, i) => {
          const pct = seg.value / total
          const dashLength = pct * circumference
          const dashOffset = -accumulatedOffset
          accumulatedOffset += dashLength

          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
              className="transition-all duration-300"
            />
          )
        })}
        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-text-primary text-xs font-semibold">
          ${formatUsd(total)}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-text-muted text-[8px]">
          Total
        </text>
      </svg>

      {/* Legend */}
      <div className="space-y-1.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-[10px] text-text-muted w-16">{seg.label}</span>
            <span className="text-[10px] font-mono text-text-primary">${formatUsd(seg.value)}</span>
            <span className="text-[9px] font-mono text-text-muted">
              {((seg.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
