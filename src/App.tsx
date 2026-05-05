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
import { StrategyLibraryPage } from './pages/StrategyLibraryPage'
import { ProfilePage } from './pages/ProfilePage'
import { BotManagerPage } from './pages/BotManagerPage'
import { ProofPage } from './pages/ProofPage'
import { BacktestReplayPage } from './pages/BacktestReplayPage'
import { AuthorProfilePage } from './pages/AuthorProfilePage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/proof" element={<ProofPage />} />
        <Route path="/replay" element={<BacktestReplayPage />} />
        <Route path="/author/:handle" element={<AuthorProfilePage />} />
        <Route element={<AppShell />}>
          <Route path="/trade" element={<TradePage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/library" element={<StrategyLibraryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/bots" element={<BotManagerPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
