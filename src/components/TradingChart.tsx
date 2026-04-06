import { useEffect, useRef, useCallback } from 'react'
import { Chart } from '@chart-lib/library'
import type { OHLCBar, Theme, TimeFrame } from '@chart-lib/library'
import { DARK_THEME } from '@chart-lib/library'
import { useTradingStore } from '../store/tradingStore'
import { useRenderCount } from '../lib/useRenderCount'

const PERP_THEME: Theme = {
  ...DARK_THEME,
  background: '#111827',
  grid: '#1e293b',
  crosshair: '#475569',
  candleUp: '#22c55e',
  candleDown: '#ef4444',
  candleUpWick: '#22c55e',
  candleDownWick: '#ef4444',
  volumeUp: 'rgba(34, 197, 94, 0.2)',
  volumeDown: 'rgba(239, 68, 68, 0.2)',
  text: '#94a3b8',
  textSecondary: '#64748b',
  axisLine: '#1e293b',
  axisLabel: '#94a3b8',
  axisLabelBackground: '#1e293b',
  font: {
    family: "'JetBrains Mono', monospace",
    sizeSmall: 10,
    sizeMedium: 11,
    sizeLarge: 13,
  },
}

const TIMEFRAMES: { label: string; value: TimeFrame }[] = [
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
]

export function TradingChart() {
  useRenderCount('TradingChart')
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const activeTimeframe = useRef<TimeFrame>('1h')
  const candles = useTradingStore(s => s.candles)
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  // Initialize chart once
  useEffect(() => {
    if (!containerRef.current) return

    const chart = new Chart(containerRef.current, {
      chartType: 'candlestick',
      theme: PERP_THEME,
      features: {
        drawings: true,
        trading: false,
        indicators: true,
        volume: true,
        legend: true,
        crosshair: true,
        keyboard: true,
      },
    })

    chartRef.current = chart

    return () => {
      chart.destroy()
      chartRef.current = null
    }
  }, [])

  // Push candle data when it changes
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

  // Live update last candle on price change
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || candles.length === 0) return

    const last = candles[candles.length - 1]
    const newClose = selectedMarket.lastPrice

    chart.updateLastBar({
      time: last.time,
      open: last.open,
      high: Math.max(last.high, newClose),
      low: Math.min(last.low, newClose),
      close: newClose,
      volume: last.volume,
    })
  }, [selectedMarket.lastPrice, candles])

  const handleTimeframe = useCallback((tf: TimeFrame) => {
    activeTimeframe.current = tf
  }, [])

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border text-xs text-text-muted">
        <span className="text-text-primary font-medium">{selectedMarket.symbol}</span>
        {TIMEFRAMES.map(({ label, value }) => (
          <span
            key={value}
            className={`cursor-pointer transition-colors ${
              activeTimeframe.current === value
                ? 'text-accent'
                : 'hover:text-text-primary'
            }`}
            onClick={() => handleTimeframe(value)}
          >
            {label}
          </span>
        ))}
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
