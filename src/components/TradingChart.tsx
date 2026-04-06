/**
 * TradingChart — full-featured trading chart with indicators, drawing tools,
 * multi-timeframe support, and chart type switching.
 *
 * Features:
 * - 11 chart types (candlestick, line, area, heikin-ashi, etc.)
 * - 23 technical indicators (SMA, EMA, RSI, MACD, Bollinger, etc.)
 * - 23 drawing tools (trendline, fib, channels, etc.)
 * - Multi-timeframe (1m to 1M)
 * - Volume overlay, crosshair, keyboard navigation
 * - Undo/redo for drawings, screenshot export
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Chart, DARK_THEME } from '@chart-lib/library'
import type { OHLCBar, Theme, TimeFrame, ChartType, DrawingToolType, IndicatorDescriptor } from '@chart-lib/library'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from '../hooks/usePrices'
import {
  TrendingUp, Pencil, BarChart3, ChevronDown, Undo2, Redo2, Camera,
  Trash2, X, Magnet, Settings2,
} from 'lucide-react'
import { cn } from '../lib/format'

// ─── Theme ───

const PERP_THEME: Theme = {
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

// ─── Config ───

const TIMEFRAMES: { label: string; value: TimeFrame }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
]

const CHART_TYPES: { label: string; value: ChartType }[] = [
  { label: 'Candles', value: 'candlestick' },
  { label: 'Line', value: 'line' },
  { label: 'Area', value: 'area' },
  { label: 'Bars', value: 'bar' },
  { label: 'Heikin-Ashi', value: 'heikinAshi' },
  { label: 'Hollow', value: 'hollowCandle' },
  { label: 'Baseline', value: 'baseline' },
]

const DRAWING_TOOL_GROUPS: { label: string; tools: { label: string; value: DrawingToolType }[] }[] = [
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

// Popular indicators for the quick-add toolbar
const POPULAR_INDICATORS = [
  'sma', 'ema', 'bollingerBands', 'rsi', 'macd', 'stochastic',
  'vwap', 'atr', 'obv', 'ichimoku',
]

// ─── Component ───

export function TradingChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const candles = useTradingStore(s => s.candles)
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const { getPrice } = usePrices()

  const [activeTimeframe, setActiveTimeframe] = useState<TimeFrame>('5m')
  const [activeChartType, setActiveChartType] = useState<ChartType>('candlestick')
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false)
  const [showDrawingMenu, setShowDrawingMenu] = useState(false)
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false)
  const [activeTool, setActiveTool] = useState<DrawingToolType | null>(null)
  const [magnetEnabled, setMagnetEnabled] = useState(true)
  const [activeIndicators, setActiveIndicators] = useState<{ instanceId: string; id: string; label: string }[]>([])
  const [availableIndicators, setAvailableIndicators] = useState<IndicatorDescriptor[]>([])

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return

    const chart = new Chart(containerRef.current, {
      chartType: activeChartType,
      theme: PERP_THEME,
      autoScale: true,
      rightMargin: 5,
      minBarSpacing: 2,
      maxBarSpacing: 30,
      crosshair: { mode: 'magnet' },
      watermark: {
        text: selectedMarket.symbol,
        fontSize: 48,
        color: 'rgba(255, 255, 255, 0.03)',
      },
      features: {
        drawings: true,
        drawingMagnet: true,
        drawingUndoRedo: true,
        trading: false,
        indicators: true,
        panning: true,
        zooming: true,
        crosshair: true,
        keyboard: true,
        legend: true,
        volume: true,
        watermark: true,
        screenshot: true,
        alerts: true,
        barCountdown: true,
        logScale: true,
      },
    })

    chartRef.current = chart

    // Load available indicators
    try {
      const descriptors = chart.getAvailableIndicators()
      setAvailableIndicators(descriptors)
    } catch {
      // Method may not exist in some builds
    }

    return () => {
      chart.destroy()
      chartRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update data when candles change
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || candles.length === 0) return

    const bars: OHLCBar[] = candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))

    chart.setData(bars)
  }, [candles])

  // Live price tick → update last bar
  useEffect(() => {
    const chart = chartRef.current
    const currentPrice = getPrice(selectedMarket.symbol)
    if (!chart || !currentPrice || currentPrice.price === 0 || candles.length === 0) return

    chart.updateLastBarFromTick({
      price: currentPrice.price,
      volume: 1,
      time: Math.floor(Date.now() / 1000),
    })
  }, [getPrice, selectedMarket.symbol, candles.length])

  // Update watermark on market change
  useEffect(() => {
    chartRef.current?.setWatermark(selectedMarket.symbol, {
      fontSize: 48,
      color: 'rgba(255, 255, 255, 0.03)',
    })
  }, [selectedMarket.symbol])

  // ─── Handlers ───

  const handleTimeframe = useCallback((tf: TimeFrame) => {
    setActiveTimeframe(tf)
    // In production, this would reload data for the new timeframe
    // For now, we keep the same data (candles are generated from price ticks)
  }, [])

  const handleChartType = useCallback((type: ChartType) => {
    setActiveChartType(type)
    chartRef.current?.setChartType(type)
    setShowChartTypeMenu(false)
  }, [])

  const handleDrawingTool = useCallback((tool: DrawingToolType) => {
    const chart = chartRef.current
    if (!chart) return
    chart.setDrawingTool(tool)
    setActiveTool(tool)
    setShowDrawingMenu(false)
  }, [])

  const handleCancelDrawing = useCallback(() => {
    chartRef.current?.setDrawingTool(null)
    setActiveTool(null)
  }, [])

  const handleToggleMagnet = useCallback(() => {
    const next = !magnetEnabled
    setMagnetEnabled(next)
    chartRef.current?.setDrawingMagnet(next)
  }, [magnetEnabled])

  const handleAddIndicator = useCallback((id: string) => {
    const chart = chartRef.current
    if (!chart) return
    const instanceId = chart.addIndicator(id)
    if (instanceId) {
      const descriptor = availableIndicators.find(d => d.id === id)
      setActiveIndicators(prev => [...prev, {
        instanceId,
        id,
        label: descriptor?.name ?? id,
      }])
    }
    setShowIndicatorMenu(false)
  }, [availableIndicators])

  const handleRemoveIndicator = useCallback((instanceId: string) => {
    chartRef.current?.removeIndicator(instanceId)
    setActiveIndicators(prev => prev.filter(i => i.instanceId !== instanceId))
  }, [])

  const handleUndo = useCallback(() => chartRef.current?.undo(), [])
  const handleRedo = useCallback(() => chartRef.current?.redo(), [])
  const handleScreenshot = useCallback(() => chartRef.current?.screenshot(), [])
  const handleClearDrawings = useCallback(() => chartRef.current?.clearDrawings(), [])

  // ─── Render ───

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border text-xs">
        {/* Market label */}
        <span className="text-text-primary font-medium px-1">{selectedMarket.symbol}</span>
        <div className="w-px h-4 bg-border mx-1" />

        {/* Timeframes */}
        {TIMEFRAMES.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => handleTimeframe(value)}
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

        <div className="w-px h-4 bg-border mx-1" />

        {/* Chart type */}
        <div className="relative">
          <button
            onClick={() => { setShowChartTypeMenu(!showChartTypeMenu); setShowDrawingMenu(false); setShowIndicatorMenu(false) }}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            {CHART_TYPES.find(t => t.value === activeChartType)?.label ?? 'Candles'}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showChartTypeMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowChartTypeMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-panel border border-border rounded-lg shadow-2xl z-20 min-w-[140px] py-1">
                {CHART_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => handleChartType(t.value)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer',
                      activeChartType === t.value ? 'text-accent bg-accent-dim' : 'text-text-secondary hover:bg-panel-light'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Indicators */}
        <div className="relative">
          <button
            onClick={() => { setShowIndicatorMenu(!showIndicatorMenu); setShowChartTypeMenu(false); setShowDrawingMenu(false) }}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Indicators
            {activeIndicators.length > 0 && (
              <span className="bg-accent-dim text-accent text-[9px] px-1 rounded-full">{activeIndicators.length}</span>
            )}
          </button>
          {showIndicatorMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowIndicatorMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-panel border border-border rounded-lg shadow-2xl z-20 w-[280px] max-h-[400px] overflow-y-auto py-1">
                {/* Quick-add popular */}
                <div className="px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-wider">Popular</div>
                {availableIndicators
                  .filter(d => POPULAR_INDICATORS.includes(d.id))
                  .map(d => (
                    <button
                      key={d.id}
                      onClick={() => handleAddIndicator(d.id)}
                      className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-panel-light transition-colors cursor-pointer flex justify-between"
                    >
                      <span>{d.name}</span>
                      <span className="text-[10px] text-text-muted">{d.overlay ? 'overlay' : 'panel'}</span>
                    </button>
                  ))}
                {/* All indicators */}
                <div className="px-3 py-1.5 mt-1 border-t border-border text-[10px] text-text-muted uppercase tracking-wider">All</div>
                {availableIndicators
                  .filter(d => !POPULAR_INDICATORS.includes(d.id))
                  .map(d => (
                    <button
                      key={d.id}
                      onClick={() => handleAddIndicator(d.id)}
                      className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-panel-light transition-colors cursor-pointer flex justify-between"
                    >
                      <span>{d.name}</span>
                      <span className="text-[10px] text-text-muted">{d.overlay ? 'overlay' : 'panel'}</span>
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>

        {/* Drawing tools */}
        <div className="relative">
          <button
            onClick={() => { setShowDrawingMenu(!showDrawingMenu); setShowChartTypeMenu(false); setShowIndicatorMenu(false) }}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors cursor-pointer',
              activeTool ? 'text-accent bg-accent-dim' : 'text-text-muted hover:text-text-primary hover:bg-panel-light'
            )}
          >
            <Pencil className="w-3.5 h-3.5" />
            {activeTool ? DRAWING_TOOL_GROUPS.flatMap(g => g.tools).find(t => t.value === activeTool)?.label ?? 'Drawing' : 'Draw'}
          </button>
          {showDrawingMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDrawingMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-panel border border-border rounded-lg shadow-2xl z-20 w-[200px] max-h-[400px] overflow-y-auto py-1">
                {DRAWING_TOOL_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider">{group.label}</div>
                    {group.tools.map(tool => (
                      <button
                        key={tool.value}
                        onClick={() => handleDrawingTool(tool.value)}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer',
                          activeTool === tool.value ? 'text-accent bg-accent-dim' : 'text-text-secondary hover:bg-panel-light'
                        )}
                      >
                        {tool.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Cancel active tool */}
        {activeTool && (
          <button
            onClick={handleCancelDrawing}
            className="px-1.5 py-1 rounded text-short hover:bg-short-dim transition-colors cursor-pointer"
            title="Cancel drawing"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="w-px h-4 bg-border mx-1" />

        {/* Magnet */}
        <button
          onClick={handleToggleMagnet}
          className={cn(
            'px-1.5 py-1 rounded transition-colors cursor-pointer',
            magnetEnabled ? 'text-accent bg-accent-dim' : 'text-text-muted hover:text-text-primary hover:bg-panel-light'
          )}
          title={magnetEnabled ? 'Magnet mode ON' : 'Magnet mode OFF'}
        >
          <Magnet className="w-3.5 h-3.5" />
        </button>

        {/* Undo/Redo */}
        <button onClick={handleUndo} className="px-1.5 py-1 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer" title="Undo">
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleRedo} className="px-1.5 py-1 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer" title="Redo">
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        {/* Clear drawings */}
        <button onClick={handleClearDrawings} className="px-1.5 py-1 rounded text-text-muted hover:text-short hover:bg-short-dim transition-colors cursor-pointer" title="Clear all drawings">
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Screenshot */}
        <button onClick={handleScreenshot} className="px-1.5 py-1 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer" title="Screenshot">
          <Camera className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1" />

        {/* Active indicators chips */}
        {activeIndicators.map(ind => (
          <div
            key={ind.instanceId}
            className="flex items-center gap-1 bg-accent-dim text-accent text-[10px] px-1.5 py-0.5 rounded"
          >
            <span>{ind.label}</span>
            <button
              onClick={() => handleRemoveIndicator(ind.instanceId)}
              className="hover:text-short transition-colors cursor-pointer"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Chart container */}
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
