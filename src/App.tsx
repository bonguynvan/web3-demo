/**
 * App.tsx — Router configuration for the DeFi Trading Platform.
 *
 * Routes:
 *   /trade     — Perp + Futures trading (chart, order book, positions)
 *   /swap      — Spot token swaps (clean, focused layout)
 *   /earn      — Margin (Aave V3) + Pool (LP)
 *   /portfolio — Full portfolio dashboard
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { TradePage } from './pages/TradePage'
import { SwapPage } from './pages/SwapPage'
import { EarnPage } from './pages/EarnPage'
import { PortfolioPage } from './pages/PortfolioPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/trade" element={<TradePage />} />
          <Route path="/swap" element={<SwapPage />} />
          <Route path="/earn" element={<EarnPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="*" element={<Navigate to="/trade" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
