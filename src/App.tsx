/**
 * App.tsx — Main layout for the Perp DEX.
 *
 * Two modes available via the toggle:
 * - Web3 mode: Real wallet connection, EIP-712 signing, virtualized orderbook
 * - Demo mode: Mock wallet, original components (for demo without MetaMask)
 */

import { useState } from 'react'
import { Web3Header } from './components/Web3Header'
import { Header } from './components/Header'
import { TradingChart } from './components/TradingChart'
import { OrderBook } from './components/OrderBook'
import { VirtualizedOrderBook } from './components/VirtualizedOrderBook'
import { OrderForm } from './components/OrderForm'
import { Web3OrderForm } from './components/Web3OrderForm'
import { PositionsTable } from './components/PositionsTable'
import { RecentTrades } from './components/RecentTrades'
import { PerfOverlay } from './components/PerfOverlay'
import { StressTestPanel } from './components/StressTestPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useMarketWs } from './hooks/useMarketWs'
import { useOrderbook } from './hooks/useOrderbook'
import { useTradingStore } from './store/tradingStore'

function App() {
  const [web3Mode, setWeb3Mode] = useState(true)
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  // Real-time data hooks
  useMarketWs({ wsUrl: null, market: selectedMarket.symbol })
  useOrderbook({ wsUrl: null, market: selectedMarket.symbol, throttleMs: 100 })

  return (
    <div className="flex flex-col h-screen bg-surface">
      {/* Header with mode toggle overlay */}
      <div className="relative shrink-0">
        {web3Mode ? <Web3Header /> : <Header />}
        {/* Mode toggle — positioned inside the header bar, centered */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-1 bg-surface/80 backdrop-blur rounded-md p-0.5 text-[10px]">
          <button
            onClick={() => setWeb3Mode(false)}
            className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${!web3Mode ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}
          >
            Demo
          </button>
          <button
            onClick={() => setWeb3Mode(true)}
            className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${web3Mode ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}
          >
            Web3
          </button>
        </div>
      </div>

      {/* Main Trading Layout */}
      <div className="flex-1 flex gap-1 p-1 min-h-0">
        {/* Left: Chart + Positions */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="flex-[3] min-h-0">
            <ErrorBoundary name="Chart">
              <TradingChart />
            </ErrorBoundary>
          </div>
          <div className="flex-[1.2] min-h-0">
            <ErrorBoundary name="Positions">
              <PositionsTable />
            </ErrorBoundary>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-[580px] flex gap-1 shrink-0">
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex-[2] min-h-0">
              <ErrorBoundary name="OrderBook">
                {web3Mode ? <VirtualizedOrderBook /> : <OrderBook />}
              </ErrorBoundary>
            </div>
            <div className="flex-1 min-h-0">
              <ErrorBoundary name="Trades">
                <RecentTrades />
              </ErrorBoundary>
            </div>
          </div>
          <div className="w-[250px] shrink-0">
            <ErrorBoundary name="OrderForm">
              {web3Mode ? <Web3OrderForm /> : <OrderForm />}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Dev tools */}
      <PerfOverlay />
      <StressTestPanel />
    </div>
  )
}

export default App
