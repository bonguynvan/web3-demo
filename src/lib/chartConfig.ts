import type { Theme, TimeFrame, ChartType, DrawingToolType } from '@chart-lib/library'
import { DARK_THEME } from '@chart-lib/library'

export const PERP_THEME: Theme = {
  ...DARK_THEME,
  name: 'perp-dark',
  background: '#0f1729',
  grid: '#1a2540',
  crosshair: '#475569',
  candleUp: '#22c55e',
  candleDown: '#ef4444',
  candleUpWick: '#22c55e',
  candleDownWick: '#ef4444',
  volumeUp: 'rgba(34, 197, 94, 0.15)',
  volumeDown: 'rgba(239, 68, 68, 0.15)',
  lineColor: '#3b82f6',
  areaTopColor: 'rgba(59, 130, 246, 0.3)',
  areaBottomColor: 'rgba(59, 130, 246, 0.02)',
  text: '#94a3b8',
  textSecondary: '#64748b',
  axisLine: '#1a2540',
  axisLabel: '#94a3b8',
  axisLabelBackground: '#1a2540',
  font: {
    family: "'JetBrains Mono', 'SF Mono', monospace",
    sizeSmall: 10,
    sizeMedium: 11,
    sizeLarge: 13,
  },
}

export const TIMEFRAMES: { label: string; value: TimeFrame }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
]

export const CHART_TYPES: { label: string; value: ChartType }[] = [
  { label: 'Candles', value: 'candlestick' },
  { label: 'Line', value: 'line' },
  { label: 'Area', value: 'area' },
  { label: 'Bars', value: 'bar' },
  { label: 'Heikin-Ashi', value: 'heikinAshi' },
  { label: 'Hollow', value: 'hollowCandle' },
  { label: 'Baseline', value: 'baseline' },
]

export const DRAWING_TOOL_GROUPS: { label: string; tools: { label: string; value: DrawingToolType }[] }[] = [
  {
    label: 'Lines',
    tools: [
      { label: 'Trend Line', value: 'trendLine' },
      { label: 'Horizontal Line', value: 'horizontalLine' },
      { label: 'Vertical Line', value: 'verticalLine' },
      { label: 'Ray', value: 'ray' },
      { label: 'Extended Line', value: 'extendedLine' },
    ],
  },
  {
    label: 'Channels',
    tools: [
      { label: 'Parallel Channel', value: 'parallelChannel' },
      { label: 'Regression Channel', value: 'regressionChannel' },
    ],
  },
  {
    label: 'Fibonacci',
    tools: [
      { label: 'Fib Retracement', value: 'fibRetracement' },
      { label: 'Fib Extension', value: 'fibExtension' },
    ],
  },
  {
    label: 'Shapes',
    tools: [
      { label: 'Rectangle', value: 'rectangle' },
      { label: 'Ellipse', value: 'ellipse' },
      { label: 'Triangle', value: 'triangle' },
    ],
  },
  {
    label: 'Gann & Advanced',
    tools: [
      { label: 'Pitchfork', value: 'pitchfork' },
      { label: 'Gann Fan', value: 'gannFan' },
      { label: 'Gann Box', value: 'gannBox' },
      { label: 'Elliott Wave', value: 'elliottWave' },
    ],
  },
  {
    label: 'Measure',
    tools: [
      { label: 'Price Range', value: 'priceRange' },
      { label: 'Date Range', value: 'dateRange' },
      { label: 'Measure', value: 'measure' },
    ],
  },
  {
    label: 'Annotation',
    tools: [
      { label: 'Text', value: 'text' },
      { label: 'Arrow', value: 'arrow' },
    ],
  },
]

export const POPULAR_INDICATORS = [
  'sma', 'ema', 'bollingerBands', 'rsi', 'macd', 'stochastic',
  'vwap', 'atr', 'obv', 'ichimoku',
]
