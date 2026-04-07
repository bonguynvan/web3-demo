/**
 * App.tsx — Main trading layout for the Perp DEX.
 *
 * Two data modes:
 * 1. Normal: useMarketWs (oracle prices or basic simulation)
 * 2. Stress test: useSimulator (N pairs, configurable tick rate)
 *
 * Toggle via the DevOverlay panel (bottom-right).
 */

import { useState } from 'react'
import { Web3Header } from './components/Web3Header'
import { TradingChart } from './components/TradingChart'
import { DepthBook } from './components/DepthBook'
import { Web3OrderForm } from './components/Web3OrderForm'
import { PositionsTable } from './components/PositionsTable'
import { RecentTrades } from './components/RecentTrades'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DevOverlay } from './components/DevOverlay'
import { ToastContainer } from './components/ToastContainer'
import { useMarketWs } from './hooks/useMarketWs'
import { useSimulator } from './hooks/useSimulator'
import { useTradingStore } from './store/tradingStore'

function App() {
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  // Simulator controls
  const [simEnabled, setSimEnabled] = useState(false)
  const [pairCount, setPairCount] = useState(10)
  const [intervalMs, setIntervalMs] = useState(50)

  // Normal mode: oracle + basic simulation
  const normalWs = useMarketWs({
    wsUrl: null,
    market: selectedMarket.symbol,
    disabled: simEnabled,
  })

  // Stress test mode: PriceSimulator
  const simState = useSimulator({
    enabled: simEnabled,
    pairCount,
    intervalMs,
  })

  const chartLoading = simEnabled ? simState.loading : normalWs.loading

  return (
    <div className="flex flex-col h-screen bg-surface">
      <Web3Header />

      {/* Main Trading Layout */}
      <div className="flex-1 flex flex-col xl:flex-row gap-1 p-1 min-h-0">
        {/* Left: Chart + Positions */}
        <div className="flex-1 flex flex-col gap-1 min-w-0 min-h-0">
          <div className="flex-[3] min-h-[300px] xl:min-h-0">
            <ErrorBoundary name="Chart">
              <TradingChart loading={chartLoading} />
            </ErrorBoundary>
          </div>
          <div className="flex-[1.2] min-h-[200px] xl:min-h-0">
            <ErrorBoundary name="Positions">
              <PositionsTable />
            </ErrorBoundary>
          </div>
        </div>

        {/* Right: MarketInfo + Trades + OrderForm */}
        <div className="xl:w-[600px] flex flex-col xl:flex-row gap-1 shrink-0">
          <div className="flex-1 flex flex-col gap-1 min-h-0">
            <div className="flex-[2] min-h-[200px] xl:min-h-0">
              <ErrorBoundary name="DepthBook">
                <DepthBook />
              </ErrorBoundary>
            </div>
            <div className="flex-1 min-h-[150px] xl:min-h-0">
              <ErrorBoundary name="Trades">
                <RecentTrades />
              </ErrorBoundary>
            </div>
          </div>
          <div className="xl:w-[280px] shrink-0 min-h-[400px] xl:min-h-0">
            <ErrorBoundary name="OrderForm">
              <Web3OrderForm />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Dev Panel */}
      <DevOverlay
        simEnabled={simEnabled}
        onToggleSim={() => setSimEnabled(v => !v)}
        pairCount={pairCount}
        onPairCount={setPairCount}
        intervalMs={intervalMs}
        onIntervalMs={setIntervalMs}
        stats={simState}
      />
    </div>
  )
}

export default App
