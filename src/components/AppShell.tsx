/**
 * AppShell — shared layout wrapper for all pages.
 *
 * Provides: header, account bar, connection banner, toast container,
 * and global hooks (price alerts, futures settlement, etc.).
 * Each page renders inside the <Outlet />.
 */

import { Outlet } from 'react-router-dom'
import { Web3Header } from './Web3Header'
import { AccountBar } from './AccountBar'
import { ConnectionBanner } from './ConnectionBanner'
import { Sidebar } from './Sidebar'
import { MobileBottomNav } from './MobileBottomNav'
import { ToastContainer } from './ToastContainer'
import { useMarketWs } from '../hooks/useMarketWs'
import { useSyncMarkets } from '../hooks/useSyncMarkets'
import { useSignalAlerts } from '../hooks/useSignalAlerts'
import { useBotEngine } from '../hooks/useBotEngine'
import { useTradeFeed } from '../hooks/useTradeFeed'
import { useLimitOrderWatcher } from '../hooks/useLimitOrderWatcher'
import { useLiquidationAlerts } from '../hooks/useLiquidationAlerts'
import { usePriceAlertWatcher } from '../hooks/usePriceAlertWatcher'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useTradingStore } from '../store/tradingStore'

export function AppShell() {
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  // Global hooks — run regardless of which page is active
  useSyncMarkets()
  useSignalAlerts()
  useBotEngine()
  useMarketWs({ wsUrl: null, market: selectedMarket.symbol })
  useTradeFeed()
  useLimitOrderWatcher()
  useLiquidationAlerts()
  usePriceAlertWatcher()
  useDocumentTitle()

  return (
    <div className="flex h-screen bg-surface">
      {/* Left sidebar — desktop only (hidden below md:) */}
      <Sidebar />

      {/* Right column: header + content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Web3Header />
        <AccountBar />
        <ConnectionBanner />

        {/* Page content */}
        <div className="flex-1 min-h-0">
          <Outlet />
        </div>

        {/* Mobile-only bottom-tab nav (Sidebar handles md+) */}
        <MobileBottomNav />

        <ToastContainer />
      </div>
    </div>
  )
}
