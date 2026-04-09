/**
 * App.tsx — Main trading layout for the Perp DEX.
 */

import { Web3Header } from './components/Web3Header'
import { AccountBar } from './components/AccountBar'
import { TradingChart } from './components/TradingChart'
import { DepthBook } from './components/DepthBook'
import { TradePanel } from './components/TradePanel'
import { PositionsTable } from './components/PositionsTable'
import { RecentTrades } from './components/RecentTrades'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer } from './components/ToastContainer'
import { useMarketWs } from './hooks/useMarketWs'
import { useTradeFeed } from './hooks/useTradeFeed'
import { useLimitOrderWatcher } from './hooks/useLimitOrderWatcher'
import { useLiquidationAlerts } from './hooks/useLiquidationAlerts'
import { useTradingStore } from './store/tradingStore'

function App() {
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  // Price data → candle generation
  const { loading: chartLoading } = useMarketWs({
    wsUrl: null,
    market: selectedMarket.symbol,
  })

  // Stream trades into the trade tape
  useTradeFeed()

  // Auto-fire pending limit orders when the oracle price hits their trigger.
  // Mounted at App level so it survives tab switches inside TradePanel.
  useLimitOrderWatcher()

  // Warn the user before the liquidator keeper force-closes a position.
  // Informational only — no auto-close. See hook file for threshold details.
  useLiquidationAlerts()

  return (
    <div className="flex flex-col h-screen bg-surface">
      <Web3Header />
      <AccountBar />

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

        {/* Right: DepthBook + Trades + OrderForm */}
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
              <TradePanel />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}

export default App
