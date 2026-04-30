/**
 * App.tsx — Router configuration for TradingDek.
 *
 * Routes:
 *   /          — Landing page (marketing, no AppShell)
 *   /trade     — Perp trading (chart, order book, positions, signals, bots)
 *   /portfolio — Cross-venue portfolio dashboard
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LandingPage } from './pages/LandingPage'
import { TradePage } from './pages/TradePage'
import { PortfolioPage } from './pages/PortfolioPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<AppShell />}>
          <Route path="/trade" element={<TradePage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
