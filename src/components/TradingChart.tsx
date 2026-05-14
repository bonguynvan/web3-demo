/**
 * TradingChart — full-featured trading chart with indicators, drawing tools,
 * multi-timeframe support, and chart type switching.
 *
 * Shows a loading overlay until candle data is ready.
 * Defers chart creation until the container has real dimensions.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Chart, BinanceAdapter } from '@tradecanvas/chart'
import type { OHLCBar, TimeFrame, ChartType, DrawingToolType, IndicatorDescriptor, TradingPosition, TradingOrder } from '@tradecanvas/chart'
import { Loader2 } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { usePrices } from '../hooks/usePrices'
import { usePositions } from '../hooks/usePositions'
import { useModeStore } from '../store/modeStore'
import { useThemeStore } from '../store/themeStore'
import { useIsDemo } from '../store/modeStore'
import { useToast } from '../store/toastStore'
import { getChartTheme } from '../lib/chartConfig'
import { ChartToolbar } from './ChartToolbar'
import { DrawToolsSidebar } from './DrawToolsSidebar'
import { ChartSettings, DEFAULT_SETTINGS, type ChartSettingsState } from './ChartSettings'
import {
  saveLayoutToStorage, loadLayoutFromStorage, hasStoredLayout,
  clearStoredLayout, downloadLayoutFile, loadLayoutFromFile,
} from '../lib/chartLayout'
import { getDemoOrders, type DemoOrder } from '../lib/demoData'
import { useSignals } from '../hooks/useSignals'
import { useSignalPerformanceStore } from '../store/signalPerformanceStore'
import { buildSignalDrawings, buildResolvedSignalDrawings, isSignalDrawing } from '../lib/signalChartMarkers'
import type { Signal } from '../signals/types'

// Map our market symbols to Binance symbols
// localStorage key the chart library uses for its own state blob
// (indicators + drawings + chart-type + theme). The library owns
// the schema; we just choose where to store it.
const CHART_STATE_KEY = 'tc-chart-state-v1'

const BINANCE_SYMBOLS: Record<string, string> = {
  'ETH-PERP': 'ETHUSDT',
  'BTC-PERP': 'BTCUSDT',
  'SOL-PERP': 'SOLUSDT',
  'ARB-PERP': 'ARBUSDT',
  'DOGE-PERP': 'DOGEUSDT',
  'LINK-PERP': 'LINKUSDT',
  'AVAX-PERP': 'AVAXUSDT',
}


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
  const [showSettings, setShowSettings] = useState(false)
  const [chartSettings, setChartSettings] = useState<ChartSettingsState>(DEFAULT_SETTINGS)
  const [hasLayout, setHasLayout] = useState<boolean>(() => hasStoredLayout())

  // Trading overlay data
  const isDemo = useIsDemo()
  const toast = useToast()
  const { positions } = usePositions()

  // App theme — read here so the chart is born with the right colors.
  // Capture in a ref so the create effect can read it without listing
  // appTheme in its deps (which would tear down + rebuild the chart on
  // every theme switch and lose drawings/indicators).
  const appTheme = useThemeStore(s => s.theme)
  const appThemeRef = useRef(appTheme)
  appThemeRef.current = appTheme

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
        theme: getChartTheme(appThemeRef.current),
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
          trading: true,
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

      // Restore the user's last chart setup — indicators, drawings,
      // chart-type, theme — from localStorage if present. Library
      // owns the serialization shape; we just hand off the key.
      try { chart.loadStateFromStorage(CHART_STATE_KEY) } catch { /* ignore */ }

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

  // Sync chart theme with app theme. chartReady is in the deps so this
  // also fires once after the async chart creation completes — that's
  // what catches the "refresh in light mode → chart starts dark" bug.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return
    chart.setTheme(getChartTheme(appTheme))
  }, [appTheme, chartReady])

  // Persist chart state (indicators + drawings + type + theme) so the
  // user's setup survives reloads. saveState is cheap; we run it on
  // a 5s tick AND on tab-hide so we don't lose work on an accidental
  // close. The library handles change detection internally — a save
  // with no diff is a no-op.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return
    const persist = () => {
      try { chart.saveState(CHART_STATE_KEY) } catch { /* storage full */ }
    }
    const interval = window.setInterval(persist, 5_000)
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    document.addEventListener('visibilitychange', onVisChange)
    window.addEventListener('beforeunload', persist)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisChange)
      window.removeEventListener('beforeunload', persist)
      // One final save on unmount so a route change doesn't lose state.
      persist()
    }
  }, [chartReady])

  // Update watermark on market change
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setWatermark(selectedMarket.symbol, {
      fontSize: 48,
      color: 'rgba(255, 255, 255, 0.03)',
    })
  }, [selectedMarket.symbol])

  // ─── Binance live data connection ───
  // In demo mode: connect to Binance for real candles (free, no key needed)
  // In live mode: data comes from on-chain oracle (handled by store sync below)
  const mode = useModeStore(s => s.mode)
  const binanceConnectedRef = useRef<string | null>(null)

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    const binanceSymbol = BINANCE_SYMBOLS[selectedMarket.symbol]
    const streamKey = `${binanceSymbol}:${activeTimeframe}`

    // Only connect in demo mode with a valid Binance symbol
    if (mode === 'demo' && binanceSymbol) {
      // Skip if already connected to this exact stream
      if (binanceConnectedRef.current === streamKey) return

      // Connect to Binance
      const adapter = new BinanceAdapter()
      chart.connect({
        adapter,
        symbol: binanceSymbol,
        timeframe: activeTimeframe,
        historyLimit: 300,
      }).then(() => {
        binanceConnectedRef.current = streamKey
        // Update watermark with real symbol
        chart.setWatermark(`${selectedMarket.symbol}`, {
          fontSize: 48,
          color: 'rgba(255, 255, 255, 0.03)',
        })
      }).catch(() => {
        // Binance failed (CORS, offline, etc.) — fall through to store data
        binanceConnectedRef.current = null
      })
    } else {
      // Live mode or no Binance symbol — disconnect stream, use store data
      if (binanceConnectedRef.current) {
        chart.disconnectStream()
        binanceConnectedRef.current = null
      }
    }
  }, [chartReady, mode, selectedMarket.symbol, activeTimeframe])

  // Cleanup Binance on unmount
  useEffect(() => {
    return () => {
      binanceConnectedRef.current = null
    }
  }, [])

  // Sync candle data from store → chart (rAF-throttled)
  // Skip when Binance is providing data directly to the chart.
  useEffect(() => {
    if (!chartReady) return

    let rafId = 0
    let dirty = false

    const flush = () => {
      rafId = 0
      dirty = false

      // Skip store sync when Binance is feeding data directly
      if (binanceConnectedRef.current) return

      const chart = chartRef.current
      if (!chart) return

      const { candles } = useTradingStore.getState()
      if (candles.length === 0) {
        lastCandleCountRef.current = 0
        return
      }

      const prevCount = lastCandleCountRef.current

      if (prevCount === 0 || candles.length > prevCount + 5) {
        // Bulk load — map to OHLCBar[]
        const bars: OHLCBar[] = candles.map(c => ({
          time: c.time, open: c.open, high: c.high,
          low: c.low, close: c.close, volume: c.volume,
        }))
        chart.setData(bars)
        lastCandleCountRef.current = candles.length
      } else if (candles.length > prevCount) {
        // New candle(s) — append only the latest
        const newCandle = candles[candles.length - 1]
        chart.appendBar({
          time: newCandle.time, open: newCandle.open, high: newCandle.high,
          low: newCandle.low, close: newCandle.close, volume: newCandle.volume,
        })
        lastCandleCountRef.current = candles.length
      } else {
        // Same candle count — just update the last bar (cheapest path)
        const last = candles[candles.length - 1]
        chart.updateLastBar({
          time: last.time, open: last.open, high: last.high,
          low: last.low, close: last.close, volume: last.volume,
        })
      }
    }

    // Subscribe to store but only schedule ONE rAF per frame
    const unsub = useTradingStore.subscribe(() => {
      if (!dirty) {
        dirty = true
        if (!rafId) rafId = requestAnimationFrame(flush)
      }
    })

    return () => {
      unsub()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [chartReady])

  // ─── Signal markers ──────────────────────────────────────────────────
  // Paint long/short arrows for every signal that has fired on the active
  // market. We merge live signals (still in the active feed) with the
  // performance store's pending + resolved history so historical fires
  // stay on the chart instead of disappearing when the signal ages out
  // of the live list. User-drawn shapes are preserved.
  const signals = useSignals()
  const performancePending = useSignalPerformanceStore(s => s.pending)
  const performanceResolved = useSignalPerformanceStore(s => s.resolved)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    // Live + pending signals: full-tone direction-coded arrows.
    const liveMerged = new Map<string, Signal>()
    for (const s of signals) liveMerged.set(s.id, s)
    for (const p of performancePending) {
      if (!liveMerged.has(p.id)) liveMerged.set(p.id, performanceEntryToSignal(p))
    }

    // Resolved signals: hit/miss-coded faded arrows so users get a
    // retrospective audit at a glance — green = signal worked, red =
    // signal missed. Kept separate from the live route so a stale
    // signal can't mask its outcome.
    const existing = chart.getDrawings() as { id: string }[]
    const userKept = existing.filter(d => !isSignalDrawing(d))
    const liveDrawings = buildSignalDrawings(Array.from(liveMerged.values()), selectedMarket.symbol)
    const resolvedDrawings = buildResolvedSignalDrawings(performanceResolved, selectedMarket.symbol)
    chart.setDrawings([...userKept, ...resolvedDrawings, ...liveDrawings] as Parameters<typeof chart.setDrawings>[0])
  }, [signals, performancePending, performanceResolved, selectedMarket.symbol, chartReady])

  // Live price line (also rAF-throttled)
  const currentPrice = getPrice(selectedMarket.symbol)
  const lastPriceRef = useRef(0)

  useEffect(() => {
    // ALWAYS drive the price line from usePrices (the shared binanceTicker
    // source) — even when BinanceAdapter is connected for candle data.
    // This ensures the chart's live price line matches the positions PnL,
    // header price, and tab title exactly. Previously this was skipped when
    // Binance was connected, letting the kline stream's price diverge from
    // the miniTicker stream the rest of the app uses.
    const chart = chartRef.current
    if (!chart || !currentPrice || currentPrice.price === 0) return
    if (currentPrice.price === lastPriceRef.current) return
    lastPriceRef.current = currentPrice.price
    chart.setCurrentPrice(currentPrice.price)
  }, [currentPrice])

  // ─── Position overlay (MT4/MT5 style) ──────────────────────────────────
  // Map open positions for the current market into TradingPosition shape
  // and push them into the chart-libs trading layer. Liquidation price is
  // surfaced as `stopLoss` so it renders as a dashed warning line.
  useEffect(() => {
    if (!chartReady) return
    const chart = chartRef.current
    if (!chart) return

    const forMarket = positions.filter(p => p.market === selectedMarket.symbol)
    const tradingPositions: TradingPosition[] = forMarket.map(p => {
      const quantityCoin = p.markPrice > 0 ? p.size / p.markPrice : 0
      return {
        id: p.key,
        side: p.side === 'long' ? 'buy' : 'sell',
        entryPrice: p.entryPrice,
        quantity: +quantityCoin.toFixed(6),
        stopLoss: p.liquidationPrice > 0 ? p.liquidationPrice : undefined,
        meta: {
          pnl: p.pnl,
          pnlPercent: p.pnlPercent,
          leverage: p.leverage,
          collateral: p.collateral,
        },
      }
    })

    chart.setPositions(tradingPositions)
  }, [chartReady, positions, selectedMarket.symbol])

  // ─── Pending order overlay (TP/SL + Limit opens) ──────────────────────
  // Runs in BOTH modes. Neither the contracts nor any backend supports
  // limit orders right now, so the client-side demo store doubles as the
  // pending order cache for live mode too. Polls the store at 500ms to
  // match PositionsTable's OrdersTab cadence.
  //
  // Side semantics:
  //   - TP / SL orders CLOSE an existing position, so the chart line's
  //     side is the opposite of the underlying position side (closing a
  //     long means selling).
  //   - Limit opens take the user's chosen side directly — a long limit
  //     buy renders as a buy line, a short limit sell renders as a sell.
  useEffect(() => {
    if (!chartReady) return
    const chart = chartRef.current
    if (!chart) return

    const sync = () => {
      const orders = getDemoOrders().filter((o: DemoOrder) => o.market === selectedMarket.symbol)
      const tradingOrders: TradingOrder[] = orders.map(o => {
        const isClosing = o.type === 'Take Profit' || o.type === 'Stop Loss'
        const chartSide: 'buy' | 'sell' = isClosing
          ? (o.side === 'long' ? 'sell' : 'buy')
          : (o.side === 'long' ? 'buy' : 'sell')
        const quantityCoin = o.triggerPrice > 0 ? o.size / o.triggerPrice : o.size
        const label: 'LIMIT' | 'TP' | 'SL' =
          o.type === 'Take Profit' ? 'TP' :
          o.type === 'Stop Loss' ? 'SL' :
          'LIMIT'
        return {
          id: o.id,
          side: chartSide,
          type: 'limit',
          price: o.triggerPrice,
          quantity: +quantityCoin.toFixed(6),
          label,
          draggable: false, // cancel via Orders tab, not drag
        }
      })
      chart.setOrders(tradingOrders)
    }

    sync()
    const id = setInterval(sync, 500)
    return () => clearInterval(id)
  }, [chartReady, isDemo, selectedMarket.symbol])

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

  // ─── Layout save/load handlers ─────────────────────────────────────────

  /** Pull the active indicator list back into local state after a load. */
  const syncIndicatorState = useCallback(() => {
    const chart = chartRef.current
    if (!chart) return
    try {
      const active = chart.getActiveIndicators()
      setActiveIndicators(active.map(a => ({
        instanceId: a.instanceId,
        id: a.id,
        label: a.descriptor?.name ?? a.id,
      })))
    } catch {
      /* ignore */
    }
  }, [])

  const handleSaveLayout = useCallback(() => {
    const chart = chartRef.current
    if (!chart) return
    if (saveLayoutToStorage(chart)) {
      setHasLayout(true)
      toast.success('Layout saved', 'Drawings + indicators stored in this browser')
    } else {
      toast.error('Save failed', 'Could not write to localStorage')
    }
  }, [toast])

  const handleLoadLayout = useCallback(() => {
    const chart = chartRef.current
    if (!chart) return
    if (loadLayoutFromStorage(chart)) {
      syncIndicatorState()
      toast.success('Layout restored', 'Loaded from saved browser state')
    } else {
      toast.error('Nothing to load', 'No saved layout found in this browser')
    }
  }, [toast, syncIndicatorState])

  const handleDownloadLayout = useCallback(() => {
    const chart = chartRef.current
    if (!chart) return
    if (downloadLayoutFile(chart, `chart-layout-${selectedMarket.symbol}.json`)) {
      toast.success('Layout downloaded', 'Saved to your downloads folder')
    } else {
      toast.error('Download failed', 'Save was empty')
    }
  }, [toast, selectedMarket.symbol])

  const handleUploadLayout = useCallback(async () => {
    const chart = chartRef.current
    if (!chart) return
    try {
      await loadLayoutFromFile(chart)
      syncIndicatorState()
      toast.success('Layout loaded', 'Imported from file')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not parse file'
      toast.error('Load failed', msg)
    }
  }, [toast, syncIndicatorState])

  const handleClearLayout = useCallback(() => {
    clearStoredLayout()
    setHasLayout(false)
    toast.success('Saved layout cleared', '')
  }, [toast])

  // Apply settings changes to the chart instance
  const handleSettingsChange = useCallback((patch: Partial<ChartSettingsState>) => {
    setChartSettings(prev => {
      const next = { ...prev, ...patch }
      const chart = chartRef.current
      if (chart) {
        // Apply theme changes
        if (patch.candleUpColor || patch.candleDownColor || patch.candleUpWick || patch.candleDownWick || patch.backgroundColor || patch.gridColor) {
          chart.setTheme({
            ...getChartTheme(appThemeRef.current),
            candleUp: next.candleUpColor,
            candleDown: next.candleDownColor,
            candleUpWick: next.candleUpWick,
            candleDownWick: next.candleDownWick,
            background: next.backgroundColor,
            grid: next.gridColor,
          })
        }
        if ('gridVisible' in patch) chart.setGridVisible(next.gridVisible)
        if ('volumeVisible' in patch) chart.setVolumeVisible(next.volumeVisible)
        if ('legendVisible' in patch) chart.setLegend({ visible: next.legendVisible })
        if ('barCountdown' in patch) chart.setBarCountdownVisible(next.barCountdown)
        if ('logScale' in patch) chart.setLogScale(next.logScale)
        if ('autoScale' in patch) chart.setAutoScale(next.autoScale)
        if ('crosshairMode' in patch) chart.setCrosshairMode(next.crosshairMode)
      }
      return next
    })
  }, [])

  const handleSettingsReset = useCallback(() => {
    handleSettingsChange(DEFAULT_SETTINGS)
  }, [handleSettingsChange])

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      <ChartToolbar
        market={selectedMarket.symbol}
        activeTimeframe={activeTimeframe}
        activeChartType={activeChartType}
        activeIndicators={activeIndicators}
        availableIndicators={availableIndicators}
        hasStoredLayout={hasLayout}
        onTimeframe={handleTimeframe}
        onChartType={handleChartType}
        onAddIndicator={handleAddIndicator}
        onRemoveIndicator={handleRemoveIndicator}
        onScreenshot={handleScreenshot}
        onSettings={() => setShowSettings(true)}
        onSaveLayout={handleSaveLayout}
        onLoadLayout={handleLoadLayout}
        onDownloadLayout={handleDownloadLayout}
        onUploadLayout={handleUploadLayout}
        onClearLayout={handleClearLayout}
      />

      {/* Draw sidebar + Chart canvas */}
      <div className="flex flex-1 min-h-0">
        <DrawToolsSidebar
          activeTool={activeTool}
          magnetEnabled={magnetEnabled}
          onDrawingTool={handleDrawingTool}
          onCancelDrawing={handleCancelDrawing}
          onToggleMagnet={handleToggleMagnet}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClearDrawings={handleClearDrawings}
        />

        <div className="relative flex-1 min-h-0">
          <div ref={containerRef} className="w-full h-full" />

          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-panel/90 backdrop-blur-sm">
              <ChartLoadingSpinner market={selectedMarket.symbol} />
            </div>
          )}
        </div>
      </div>

      {/* Settings dialog */}
      <ChartSettings
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={chartSettings}
        onChange={handleSettingsChange}
        onReset={handleSettingsReset}
      />
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

/**
 * Reshape a performance-store entry (pending OR resolved) into the
 * Signal shape the marker builder expects. The fields the marker
 * builder actually reads are: id, source, marketId, direction,
 * suggestedPrice, triggeredAt — the rest are filled with reasonable
 * defaults so the resulting object satisfies the Signal interface.
 */
function performanceEntryToSignal(entry: {
  id: string
  source: Signal['source']
  marketId: string
  direction: Signal['direction']
  entryPrice: number
  triggeredAt: number
}): Signal {
  return {
    id: entry.id,
    source: entry.source,
    venue: 'binance',
    marketId: entry.marketId,
    direction: entry.direction,
    confidence: 0.6,
    triggeredAt: entry.triggeredAt,
    expiresAt: entry.triggeredAt + 60 * 60_000,
    title: '',
    detail: '',
    suggestedPrice: entry.entryPrice,
  }
}
