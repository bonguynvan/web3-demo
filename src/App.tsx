/**
 * App.tsx — Main trading layout for the Perp DEX.
 *
 * GMX-style AMM layout: Chart + Positions | MarketInfo + Trades | OrderForm
 */

import { Web3Header } from './components/Web3Header'
import { TradingChart } from './components/TradingChart'
import { MarketInfo } from './components/MarketInfo'
import { Web3OrderForm } from './components/Web3OrderForm'
import { PositionsTable } from './components/PositionsTable'
import { RecentTrades } from './components/RecentTrades'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useMarketWs } from './hooks/useMarketWs'
import { useTradingStore } from './store/tradingStore'

function App() {
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  // Oracle price → candle data
  useMarketWs({ wsUrl: null, market: selectedMarket.symbol })

  return (
    <div className="flex flex-col h-screen bg-surface">
      <Web3Header />

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

        {/* Right: MarketInfo + Trades + OrderForm */}
        <div className="w-[580px] flex gap-1 shrink-0">
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex-[2] min-h-0">
              <ErrorBoundary name="MarketInfo">
                <MarketInfo />
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
              <Web3OrderForm />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
