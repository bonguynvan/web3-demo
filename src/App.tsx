/**
 * App.tsx — Router configuration for the trading terminal.
 *
 * Routes:
 *   /trade     — Perp trading (chart, order book, positions)
 *   /portfolio — Cross-venue portfolio dashboard
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { TradePage } from './pages/TradePage'
import { PortfolioPage } from './pages/PortfolioPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/trade" element={<TradePage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="*" element={<Navigate to="/trade" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
