/**
 * App.tsx — Router configuration for TradingDek.
 *
 * Eager: LandingPage (the marketing surface most visitors see first,
 * lowest LCP target). Everything else lazy-loaded so the initial
 * bundle stays small.
 *
 * A root ErrorBoundary wraps every route — a crash anywhere falls
 * through to per-route ErrorBoundary children first, then to this
 * one, which prevents a white-screen and offers a reload.
 */

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ScrollToTop } from './components/ScrollToTop'
import { LandingPage } from './pages/LandingPage'

// Lazy-loaded routes — heavy pages (chart, replay, marketplace, profile)
// don't need to ship in the initial bundle.
const TradePage = lazy(() => import('./pages/TradePage').then(m => ({ default: m.TradePage })))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })))
const StrategyLibraryPage = lazy(() => import('./pages/StrategyLibraryPage').then(m => ({ default: m.StrategyLibraryPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const BotManagerPage = lazy(() => import('./pages/BotManagerPage').then(m => ({ default: m.BotManagerPage })))
const ProofPage = lazy(() => import('./pages/ProofPage').then(m => ({ default: m.ProofPage })))
const BacktestReplayPage = lazy(() => import('./pages/BacktestReplayPage').then(m => ({ default: m.BacktestReplayPage })))
const AuthorProfilePage = lazy(() => import('./pages/AuthorProfilePage').then(m => ({ default: m.AuthorProfilePage })))
const LegalPage = lazy(() => import('./pages/LegalPage').then(m => ({ default: m.LegalPage })))

function RouteFallback() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-surface text-text-muted">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary name="App">
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/proof" element={<ProofPage />} />
            <Route path="/replay" element={<BacktestReplayPage />} />
            <Route path="/author/:handle" element={<AuthorProfilePage />} />
            <Route path="/legal" element={<Navigate to="/legal/disclaimer" replace />} />
            <Route path="/legal/:doc" element={<LegalPage />} />
            <Route element={<AppShell />}>
              <Route path="/trade" element={<TradePage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/library" element={<StrategyLibraryPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/bots" element={<BotManagerPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
