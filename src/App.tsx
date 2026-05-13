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
const LearnPage = lazy(() => import('./pages/LearnPage').then(m => ({ default: m.LearnPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })))
const PricingPage = lazy(() => import('./pages/PricingPage').then(m => ({ default: m.PricingPage })))

function RouteFallback() {
  // Layout-aware shimmer: a thin top bar + offset content blocks so the
  // page-transition skeleton matches the AppShell silhouette instead of
  // a centered spinner. Falls back gracefully on standalone pages
  // (landing, proof, legal) because no chrome is rendered above it.
  return (
    <div className="h-screen w-screen bg-surface overflow-hidden" aria-busy="true" aria-live="polite">
      <div className="h-12 border-b border-border bg-panel/40 flex items-center px-4 gap-3">
        <div className="w-24 h-3 rounded bg-surface animate-pulse" />
        <div className="w-16 h-3 rounded bg-surface/70 animate-pulse" />
      </div>
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-4">
        <div className="w-1/3 h-6 rounded bg-panel/60 animate-pulse" />
        <div className="w-2/3 h-3 rounded bg-panel/50 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
          <div className="h-24 rounded-lg bg-panel/40 animate-pulse" />
          <div className="h-24 rounded-lg bg-panel/40 animate-pulse" />
          <div className="h-24 rounded-lg bg-panel/40 animate-pulse" />
        </div>
        <div className="h-40 rounded-lg bg-panel/30 animate-pulse mt-2" />
      </div>
      <span className="sr-only">Loading page…</span>
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
            <Route path="/learn" element={<LearnPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route element={<AppShell />}>
              <Route path="/trade" element={<TradePage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/library" element={<StrategyLibraryPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/bots" element={<BotManagerPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
