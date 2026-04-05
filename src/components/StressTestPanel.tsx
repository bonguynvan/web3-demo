import { useState, useCallback, useRef, useEffect } from 'react'
import { Activity, Zap, Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/format'
import { WsClient, type ConnectionStatus } from '../lib/wsClient'
import { useTradingStore } from '../store/tradingStore'
import { perfMonitor } from '../lib/perfMonitor'

/**
 * Stress Test Panel — dial up WS update rates and watch what breaks.
 *
 * Two modes:
 * 1. Local simulation (no server needed) — uses setInterval directly
 * 2. WebSocket mode — connects to mockWsServer.ts for realistic testing
 *
 * Tests you can run:
 * - Crank ticker to 1000/sec and watch FPS drop
 * - Burst 5000 messages and check for UI freeze
 * - Disconnect test — verify reconnection + stale indicator
 * - Stale data test — verify out-of-order rejection
 */

type TestMode = 'local' | 'websocket'

interface RatePreset {
  label: string
  ticker: number
  orderbook: number
  trades: number
  description: string
}

const PRESETS: RatePreset[] = [
  { label: 'Idle', ticker: 2000, orderbook: 5000, trades: 1000, description: 'Low activity market — 1 update/2sec' },
  { label: 'Normal', ticker: 500, orderbook: 1000, trades: 200, description: 'Typical DEX activity — ~5 updates/sec' },
  { label: 'Busy', ticker: 100, orderbook: 200, trades: 50, description: 'High volume period — ~20 updates/sec' },
  { label: 'Extreme', ticker: 10, orderbook: 50, trades: 5, description: 'Market crash/pump — ~200 updates/sec' },
  { label: 'Stress', ticker: 1, orderbook: 10, trades: 1, description: '1000+ updates/sec — will it survive?' },
]

export function StressTestPanel() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<TestMode>('local')
  const [activePreset, setActivePreset] = useState(1) // Normal
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('disconnected')
  const [customRate, setCustomRate] = useState('100')
  const localIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wsClientRef = useRef<WsClient | null>(null)

  const tickPrice = useTradingStore(s => s.tickPrice)

  // ---- Local simulation mode ----
  const startLocal = useCallback((intervalMs: number) => {
    if (localIntervalRef.current) clearInterval(localIntervalRef.current)
    localIntervalRef.current = setInterval(() => {
      tickPrice()
      perfMonitor.recordUpdate()
    }, intervalMs)
  }, [tickPrice])

  const stopLocal = useCallback(() => {
    if (localIntervalRef.current) {
      clearInterval(localIntervalRef.current)
      localIntervalRef.current = null
    }
  }, [])

  // ---- WebSocket mode ----
  const connectWs = useCallback(() => {
    if (wsClientRef.current) wsClientRef.current.disconnect()

    const client = new WsClient({
      url: 'ws://localhost:8080',
      onMessage: (msg) => {
        perfMonitor.recordUpdate()
        // In a real app, we'd parse the message and update the store.
        // For stress testing, we just trigger a price tick to measure render perf.
        if (msg.type === 'ticker' || msg.type === 'snapshot') {
          tickPrice()
        }
      },
      onStatusChange: setWsStatus,
      batchUpdates: true,
    })

    client.connect()
    wsClientRef.current = client
  }, [tickPrice])

  const disconnectWs = useCallback(() => {
    wsClientRef.current?.disconnect()
    wsClientRef.current = null
  }, [])

  const sendWsCommand = useCallback((cmd: object) => {
    wsClientRef.current?.send(cmd)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLocal()
      disconnectWs()
    }
  }, [stopLocal, disconnectWs])

  const applyPreset = (index: number) => {
    setActivePreset(index)
    const preset = PRESETS[index]

    if (mode === 'local') {
      startLocal(preset.ticker)
    } else {
      sendWsCommand({ type: 'set_rate', channel: 'ticker', interval_ms: preset.ticker })
      sendWsCommand({ type: 'set_rate', channel: 'orderbook', interval_ms: preset.orderbook })
      sendWsCommand({ type: 'set_rate', channel: 'trades', interval_ms: preset.trades })
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-accent hover:bg-accent/80 text-white p-3 rounded-full shadow-lg cursor-pointer transition-colors"
        title="Open Stress Test Panel"
      >
        <Activity className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-panel border border-border rounded-lg shadow-2xl w-[360px] max-h-[calc(100vh-5rem)] flex flex-col font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Activity className="w-4 h-4 text-accent" />
          Stress Test Panel
        </div>
        <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary cursor-pointer text-lg leading-none">&times;</button>
      </div>

      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Mode Toggle */}
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Mode</div>
          <div className="flex gap-1 bg-surface rounded p-0.5">
            <button
              onClick={() => { setMode('local'); disconnectWs() }}
              className={cn(
                'flex-1 py-1.5 text-xs rounded cursor-pointer transition-colors',
                mode === 'local' ? 'bg-panel-light text-text-primary' : 'text-text-muted'
              )}
            >
              Local Simulation
            </button>
            <button
              onClick={() => { setMode('websocket'); stopLocal() }}
              className={cn(
                'flex-1 py-1.5 text-xs rounded cursor-pointer transition-colors',
                mode === 'websocket' ? 'bg-panel-light text-text-primary' : 'text-text-muted'
              )}
            >
              WebSocket Server
            </button>
          </div>
        </div>

        {/* WebSocket connection */}
        {mode === 'websocket' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              {wsStatus === 'connected' ? (
                <Wifi className="w-3.5 h-3.5 text-long" />
              ) : wsStatus === 'reconnecting' ? (
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-text-muted" />
              )}
              <span className={cn(
                wsStatus === 'connected' ? 'text-long' :
                wsStatus === 'reconnecting' ? 'text-yellow-400' :
                'text-text-muted'
              )}>
                {wsStatus}
              </span>
            </div>
            <button
              onClick={wsStatus === 'connected' ? disconnectWs : connectWs}
              className={cn(
                'text-xs px-3 py-1 rounded cursor-pointer transition-colors',
                wsStatus === 'connected'
                  ? 'bg-short/20 text-short hover:bg-short/30'
                  : 'bg-long/20 text-long hover:bg-long/30'
              )}
            >
              {wsStatus === 'connected' ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        )}

        {/* Rate Presets */}
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Load Profile</div>
          <div className="space-y-1">
            {PRESETS.map((preset, i) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(i)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded text-xs cursor-pointer transition-colors',
                  activePreset === i
                    ? 'bg-accent-dim border border-accent/30 text-text-primary'
                    : 'bg-surface hover:bg-panel-light text-text-secondary border border-transparent'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{preset.label}</span>
                  <span className="text-text-muted font-mono">
                    {(1000 / preset.ticker).toFixed(0)}/sec
                  </span>
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">{preset.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Rate */}
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Custom Interval (ms)</div>
          <div className="flex gap-2">
            <input
              type="number"
              value={customRate}
              onChange={e => setCustomRate(e.target.value)}
              className="flex-1 bg-surface border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary outline-none"
              min={1}
            />
            <button
              onClick={() => {
                const ms = Math.max(1, parseInt(customRate) || 100)
                if (mode === 'local') startLocal(ms)
                else sendWsCommand({ type: 'set_rate', channel: 'ticker', interval_ms: ms })
              }}
              className="bg-accent hover:bg-accent/80 text-white text-xs px-3 py-1.5 rounded cursor-pointer transition-colors"
            >
              Apply
            </button>
          </div>
          <div className="text-[10px] text-text-muted mt-1">
            1ms = 1000/sec | 10ms = 100/sec | 100ms = 10/sec
          </div>
        </div>

        {/* Stress Tests */}
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Stress Tests</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                if (mode === 'local') {
                  // Burst 5000 updates synchronously
                  const start = performance.now()
                  for (let i = 0; i < 5000; i++) {
                    useTradingStore.getState().tickPrice()
                    perfMonitor.recordUpdate()
                  }
                  const elapsed = performance.now() - start
                  console.log(`[StressTest] 5000 updates in ${elapsed.toFixed(1)}ms`)
                } else {
                  sendWsCommand({ type: 'burst', count: 5000, channel: 'ticker' })
                }
              }}
              className="flex items-center justify-center gap-1.5 bg-surface hover:bg-panel-light text-text-secondary text-xs py-2 rounded cursor-pointer transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Burst 5K
            </button>

            <button
              onClick={() => {
                if (mode === 'local') {
                  // Freeze test: block the main thread for 2 seconds
                  const start = performance.now()
                  while (performance.now() - start < 2000) { /* intentional block */ }
                  console.log('[StressTest] Main thread blocked for 2s')
                } else {
                  sendWsCommand({ type: 'disconnect_test', after_ms: 3000 })
                }
              }}
              className="flex items-center justify-center gap-1.5 bg-surface hover:bg-panel-light text-text-secondary text-xs py-2 rounded cursor-pointer transition-colors"
            >
              <WifiOff className="w-3.5 h-3.5" />
              {mode === 'local' ? 'Block 2s' : 'Drop Conn'}
            </button>

            <button
              onClick={() => {
                if (mode === 'websocket') {
                  sendWsCommand({ type: 'stale_test' })
                } else {
                  console.log('[StressTest] Stale test only available in WebSocket mode')
                }
              }}
              disabled={mode === 'local'}
              className={cn(
                'flex items-center justify-center gap-1.5 text-xs py-2 rounded cursor-pointer transition-colors',
                mode === 'local' ? 'bg-surface/50 text-text-muted cursor-not-allowed' : 'bg-surface hover:bg-panel-light text-text-secondary'
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Stale Data
            </button>

            <button
              onClick={() => {
                stopLocal()
                if (mode === 'websocket') {
                  sendWsCommand({ type: 'set_rate', channel: 'ticker', interval_ms: 99999 })
                  sendWsCommand({ type: 'set_rate', channel: 'orderbook', interval_ms: 99999 })
                  sendWsCommand({ type: 'set_rate', channel: 'trades', interval_ms: 99999 })
                }
              }}
              className="flex items-center justify-center gap-1.5 bg-short/10 hover:bg-short/20 text-short text-xs py-2 rounded cursor-pointer transition-colors"
            >
              Stop All
            </button>
          </div>
        </div>

        {/* WS Stats */}
        {mode === 'websocket' && wsClientRef.current && (
          <div className="border-t border-border pt-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">WebSocket Stats</div>
            <div className="text-xs space-y-0.5 font-mono">
              <div className="flex justify-between">
                <span className="text-text-muted">Received</span>
                <span className="text-text-secondary">{wsClientRef.current.messagesReceived}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Processed</span>
                <span className="text-text-secondary">{wsClientRef.current.messagesProcessed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Dropped (stale)</span>
                <span className={wsClientRef.current.messagesDropped > 0 ? 'text-yellow-400' : 'text-text-secondary'}>
                  {wsClientRef.current.messagesDropped}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="text-[10px] text-text-muted border-t border-border pt-3 space-y-1">
          <p>
            <strong className="text-text-secondary">Local mode</strong> — uses setInterval, no server needed.
            Good for testing React rendering performance.
          </p>
          <p>
            <strong className="text-text-secondary">WebSocket mode</strong> — connects to mock WS server.
            Tests the full pipeline: network, parsing, batching, rendering.
          </p>
          <p className="font-mono">Run server: npx tsx server/mockWsServer.ts</p>
        </div>
      </div>
    </div>
  )
}
