import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type Time, ColorType } from 'lightweight-charts'
import { useTradingStore } from '../store/tradingStore'
import { useRenderCount } from '../lib/useRenderCount'

export function TradingChart() {
  useRenderCount('TradingChart')
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const candles = useTradingStore(s => s.candles)
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        vertLine: { color: '#475569', width: 1, style: 2 },
        horzLine: { color: '#475569', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    chartRef.current = chart
    seriesRef.current = candleSeries
    volumeRef.current = volumeSeries

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.remove()
    }
  }, [])

  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current || candles.length === 0) return

    const candleData: CandlestickData<Time>[] = candles.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))

    const volumeData = candles.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
    }))

    seriesRef.current.setData(candleData)
    volumeRef.current.setData(volumeData)
  }, [candles])

  // Live update last candle
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return
    const last = candles[candles.length - 1]
    const newClose = selectedMarket.lastPrice
    seriesRef.current.update({
      time: last.time as Time,
      open: last.open,
      high: Math.max(last.high, newClose),
      low: Math.min(last.low, newClose),
      close: newClose,
    })
  }, [selectedMarket.lastPrice, candles])

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border text-xs text-text-muted">
        <span className="text-text-primary font-medium">{selectedMarket.symbol}</span>
        <span className="cursor-pointer hover:text-text-primary transition-colors">5m</span>
        <span className="cursor-pointer hover:text-text-primary transition-colors">15m</span>
        <span className="text-accent cursor-pointer">1H</span>
        <span className="cursor-pointer hover:text-text-primary transition-colors">4H</span>
        <span className="cursor-pointer hover:text-text-primary transition-colors">1D</span>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
