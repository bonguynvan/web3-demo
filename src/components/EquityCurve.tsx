/**
 * EquityCurve — small SVG sparkline of cumulative realized PnL.
 *
 * Pure presentational. Caller filters to closed trades and sorts
 * ascending by `closedAt` before passing in. Stretches to 100% width
 * via a 100×height viewBox + non-uniform preserveAspectRatio.
 */

import type { BotTrade } from '../bots/types'

interface EquityCurveProps {
  trades: Array<BotTrade & { closedAt: number; pnlUsd: number }>
  className?: string
  height?: number
}

export function EquityCurve({ trades, className, height = 36 }: EquityCurveProps) {
  const series: { x: number; y: number }[] = [{ x: 0, y: 0 }]
  let cum = 0
  for (let i = 0; i < trades.length; i++) {
    cum += trades[i].pnlUsd
    series.push({ x: i + 1, y: cum })
  }

  const xs = series.map(p => p.x)
  const ys = series.map(p => p.y)
  const xMin = 0
  const xMax = Math.max(...xs)
  const yMin = Math.min(0, ...ys)
  const yMax = Math.max(0, ...ys)
  const yPad = (yMax - yMin) * 0.1 || 1

  const W = 100
  const H = height
  const project = (x: number, y: number) => ({
    px: xMax > xMin ? ((x - xMin) / (xMax - xMin)) * W : W / 2,
    py: H - ((y - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad))) * H,
  })

  const points = series.map(p => {
    const { px, py } = project(p.x, p.y)
    return `${px.toFixed(2)},${py.toFixed(2)}`
  }).join(' ')

  const last = project(series[series.length - 1].x, series[series.length - 1].y)
  const first = project(series[0].x, series[0].y)
  const areaPath = `M ${first.px},${H} L ${points.replace(/,/g, ' ').replace(/  /g, ' ')} L ${last.px},${H} Z`

  const zero = project(0, 0).py
  const final = ys[ys.length - 1]
  const positive = final >= 0
  const stroke = positive ? '#22c55e' : '#ef4444'
  const fill = positive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'

  return (
    <svg
      className={className}
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <line x1={0} y1={zero} x2={W} y2={zero} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="2 2" />
      <path d={areaPath} fill={fill} />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
