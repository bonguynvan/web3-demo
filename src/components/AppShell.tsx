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
import { VaultLockBanner } from './VaultLockBanner'
import { LiveStatusBanner } from './LiveStatusBanner'
import { EntitlementBanner } from './EntitlementBanner'
import { ShipResultsBanner } from './ShipResultsBanner'
import { Sidebar } from './Sidebar'
import { MobileBottomNav } from './MobileBottomNav'
import { ToastContainer } from './ToastContainer'
import { OnboardingCard } from './OnboardingCard'
import { OnboardingWizard } from './OnboardingWizard'
import { FeedbackWidget } from './FeedbackWidget'
import { PWAInstallPrompt } from './PWAInstallPrompt'
import { MarketPalette } from './MarketPalette'
import { HotkeysModal } from './HotkeysModal'
import { GlobalPlaceOrder } from './GlobalPlaceOrder'
import { useMarketWs } from '../hooks/useMarketWs'
import { useSyncMarkets } from '../hooks/useSyncMarkets'
import { useSignalAlerts } from '../hooks/useSignalAlerts'
import { useTelegramAlerts } from '../hooks/useTelegramAlerts'
import { useSignals, useSignalsRoot } from '../hooks/useSignals'
import { useSignalPerformanceTracker } from '../hooks/useSignalPerformanceTracker'
import { useBotEngine } from '../hooks/useBotEngine'
import { useRiskMonitor } from '../hooks/useRiskMonitor'
import { useTradeFeed } from '../hooks/useTradeFeed'
import { useLimitOrderWatcher } from '../hooks/useLimitOrderWatcher'
import { useLiquidationAlerts } from '../hooks/useLiquidationAlerts'
import { usePriceAlertWatcher } from '../hooks/usePriceAlertWatcher'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useEntitlement } from '../hooks/useEntitlement'
import { useProofContribute } from '../hooks/useProofContribute'
import { useProfitableBotDetector } from '../hooks/useProfitableBotDetector'
import { useBotDriftDetector } from '../hooks/useBotDriftDetector'
import { useTradingStore } from '../store/tradingStore'

export function AppShell() {
  const selectedMarket = useTradingStore(s => s.selectedMarket)

  // Global hooks — run regardless of which page is active
  useSyncMarkets()
  // Single source of signal computation — every other consumer reads
  // from the shared store via `useSignals()` instead of recomputing.
  useSignalsRoot()
  const signals = useSignals()
  useSignalPerformanceTracker(signals)
  useSignalAlerts()
  useTelegramAlerts()
  useBotEngine()
  useRiskMonitor()
  useMarketWs({ wsUrl: null, market: selectedMarket.symbol })
  useTradeFeed()
  useLimitOrderWatcher()
  useLiquidationAlerts()
  usePriceAlertWatcher()
  useDocumentTitle()
  useEntitlement()
  useProofContribute()
  useProfitableBotDetector()
  useBotDriftDetector()

  return (
    <div className="flex h-screen bg-surface">
      {/* Skip link — visible on keyboard focus only. Lets users bypass
          sidebar + header + banners and land directly on the page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-accent focus:text-surface focus:text-xs focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Left sidebar — desktop only (hidden below md:) */}
      <Sidebar />

      {/* Right column: header + content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Web3Header />
        <AccountBar />
        <VaultLockBanner />
        <LiveStatusBanner />
        <EntitlementBanner />
        <ShipResultsBanner />

        {/* Page content */}
        <main id="main-content" tabIndex={-1} className="flex-1 min-h-0 focus:outline-none">
          <Outlet />
        </main>

        {/* Mobile-only bottom-tab nav (Sidebar handles md+) */}
        <MobileBottomNav />

        <ToastContainer />
        <OnboardingCard />
        <OnboardingWizard />
        <FeedbackWidget />
        <PWAInstallPrompt />
        <MarketPalette />
        <HotkeysModal />
        <GlobalPlaceOrder />
      </div>
    </div>
  )
}
