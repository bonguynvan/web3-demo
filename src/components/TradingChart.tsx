/**
 * TradingChart — full-featured trading chart with indicators, drawing tools,
 * multi-timeframe support, and chart type switching.
 *
 * Shows a loading overlay until candle data is ready.
 * Defers chart creation until the container has real dimensions.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Chart } from '@chart-lib/library'
import type { OHLCBar, TimeFrame, ChartType, DrawingToolType, IndicatorDescriptor } from '@chart-lib/library'
import { Loader2 } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from '../hooks/usePrices'
import { PERP_THEME } from '../lib/chartConfig'
import { ChartToolbar } from './ChartToolbar'

export function TradingChart({ loading }: { loading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const lastCandleCountRef = useRef(0)
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const { getPrice } = usePrices()
  const [chartReady, setChartReady] = useState(false)

  const activeTimeframe = useTradingStore(s => s.timeframe)
  const setActiveTimeframe = useTradingStore(s => s.setTimeframe)
  const [activeChartType, setActiveChartType] = useState<ChartType>('candlestick')
  const [activeTool, setActiveTool] = useState<DrawingToolType | null>(null)
  const [magnetEnabled, setMagnetEnabled] = useState(true)
  const [activeIndicators, setActiveIndicators] = useState<{ instanceId: string; id: string; label: string }[]>([])
  const [availableIndicators, setAvailableIndicators] = useState<IndicatorDescriptor[]>([])

  // Create chart only once, when container has dimensions
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Wait for the container to have real dimensions via ResizeObserver
    let chart: Chart | null = null

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width === 0 || height === 0) return

      // If chart already exists, just let its internal ResizeObserver handle it
      if (chart) return

      // First time container has size — create chart
      chart = new Chart(el, {
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
      lastCandleCountRef.current = 0

      try {
        setAvailableIndicators(chart.getAvailableIndicators())
      } catch {
        // fallback
      }

      setChartReady(true)

      // If there are already candles in the store, feed them now
      const { candles } = useTradingStore.getState()
      if (candles.length > 0) {
        const bars: OHLCBar[] = candles.map(c => ({
          time: c.time, open: c.open, high: c.high,
          low: c.low, close: c.close, volume: c.volume,
        }))
        chart.setData(bars)
        lastCandleCountRef.current = candles.length
      }
    })

    observer.observe(el)

    return () => {
      observer.disconnect()
      if (chart) {
        chart.destroy()
        chart = null
      }
      chartRef.current = null
      setChartReady(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update watermark on market change
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setWatermark(selectedMarket.symbol, {
      fontSize: 48,
      color: 'rgba(255, 255, 255, 0.03)',
    })
  }, [selectedMarket.symbol])

  // Sync candle data from store → chart
  useEffect(() => {
    if (!chartReady) return

    const unsub = useTradingStore.subscribe((state) => {
      const chart = chartRef.current
      if (!chart) return

      const { candles } = state
      if (candles.length === 0) {
        lastCandleCountRef.current = 0
        return
      }

      const prevCount = lastCandleCountRef.current

      if (prevCount === 0 || candles.length > prevCount + 5) {
        const bars: OHLCBar[] = candles.map(c => ({
          time: c.time, open: c.open, high: c.high,
          low: c.low, close: c.close, volume: c.volume,
        }))
        chart.setData(bars)
        lastCandleCountRef.current = candles.length
      } else if (candles.length > prevCount) {
        const newCandle = candles[candles.length - 1]
        chart.appendBar({
          time: newCandle.time, open: newCandle.open, high: newCandle.high,
          low: newCandle.low, close: newCandle.close, volume: newCandle.volume,
        })
        lastCandleCountRef.current = candles.length
      } else {
        const last = candles[candles.length - 1]
        chart.updateLastBar({
          time: last.time, open: last.open, high: last.high,
          low: last.low, close: last.close, volume: last.volume,
        })
      }
    })

    return unsub
  }, [chartReady])

  // Live price line
  const currentPrice = getPrice(selectedMarket.symbol)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !currentPrice || currentPrice.price === 0) return
    chart.setCurrentPrice(currentPrice.price)
  }, [currentPrice])

  // Handlers

  const handleTimeframe = useCallback((tf: TimeFrame) => {
    setActiveTimeframe(tf)
    // Reset chart data counter so setData fires on next candle seed
    lastCandleCountRef.current = 0
  }, [setActiveTimeframe])

  const handleChartType = useCallback((type: ChartType) => {
    setActiveChartType(type)
    chartRef.current?.setChartType(type)
  }, [])

  const handleDrawingTool = useCallback((tool: DrawingToolType) => {
    chartRef.current?.setDrawingTool(tool)
    setActiveTool(tool)
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
        instanceId, id, label: descriptor?.name ?? id,
      }])
    }
  }, [availableIndicators])

  const handleRemoveIndicator = useCallback((instanceId: string) => {
    chartRef.current?.removeIndicator(instanceId)
    setActiveIndicators(prev => prev.filter(i => i.instanceId !== instanceId))
  }, [])

  const handleUndo = useCallback(() => chartRef.current?.undo(), [])
  const handleRedo = useCallback(() => chartRef.current?.redo(), [])
  const handleScreenshot = useCallback(() => chartRef.current?.screenshot(), [])
  const handleClearDrawings = useCallback(() => chartRef.current?.clearDrawings(), [])

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      <ChartToolbar
        market={selectedMarket.symbol}
        activeTimeframe={activeTimeframe}
        activeChartType={activeChartType}
        activeTool={activeTool}
        magnetEnabled={magnetEnabled}
        activeIndicators={activeIndicators}
        availableIndicators={availableIndicators}
        onTimeframe={handleTimeframe}
        onChartType={handleChartType}
        onDrawingTool={handleDrawingTool}
        onCancelDrawing={handleCancelDrawing}
        onToggleMagnet={handleToggleMagnet}
        onAddIndicator={handleAddIndicator}
        onRemoveIndicator={handleRemoveIndicator}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onScreenshot={handleScreenshot}
        onClearDrawings={handleClearDrawings}
      />

      {/* Chart canvas + loading overlay */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-panel/90 backdrop-blur-sm">
            <ChartLoadingSpinner market={selectedMarket.symbol} />
          </div>
        )}
      </div>
    </div>
  )
}

function ChartLoadingSpinner({ market }: { market: string }) {
  return (
    <>
      <div className="relative mb-4">
        <div className="w-12 h-12 rounded-xl bg-accent-dim flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
            <rect x="4" y="6" width="3" height="12" rx="0.5" fill="currentColor" opacity="0.3">
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.5s" repeatCount="indefinite" />
            </rect>
            <rect x="4.75" y="4" width="1.5" height="2" rx="0.5" fill="currentColor" opacity="0.5" />
            <rect x="4.75" y="18" width="1.5" height="2" rx="0.5" fill="currentColor" opacity="0.5" />

            <rect x="10" y="3" width="3" height="14" rx="0.5" fill="currentColor" opacity="0.5">
              <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" begin="0.3s" repeatCount="indefinite" />
            </rect>
            <rect x="10.75" y="1" width="1.5" height="2" rx="0.5" fill="currentColor" opacity="0.5" />
            <rect x="10.75" y="17" width="1.5" height="2" rx="0.5" fill="currentColor" opacity="0.5" />

            <rect x="16" y="8" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.4">
              <animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.5s" begin="0.6s" repeatCount="indefinite" />
            </rect>
            <rect x="16.75" y="6" width="1.5" height="2" rx="0.5" fill="currentColor" opacity="0.5" />
            <rect x="16.75" y="18" width="1.5" height="3" rx="0.5" fill="currentColor" opacity="0.5" />
          </svg>
        </div>
        <Loader2 className="absolute -bottom-1 -right-1 w-4 h-4 text-accent animate-spin" />
      </div>

      <div className="text-sm text-text-primary font-medium">{market}</div>
      <div className="text-xs text-text-muted mt-1">Loading chart data...</div>

      <div className="w-32 h-0.5 bg-surface rounded-full mt-3 overflow-hidden">
        <div className="h-full bg-accent/60 rounded-full animate-[loading_2s_ease-in-out_infinite]"
          style={{ width: '60%' }} />
      </div>
    </>
  )
}
