/**
 * LandingPage — marketing page at /, separate from the AppShell-wrapped routes.
 *
 * Post-pivot positioning: research deck + auditable bots + venue-agnostic
 * execution, NOT another exchange. The hero leads with the verifiability
 * angle (proof page link next to the primary CTA), the differentiator
 * strip explains why we're not competing on order entry, and the
 * marketplace teaser pulls three live entries so visitors can see the
 * social surface before they sign in.
 */

import { useNavigate } from 'react-router-dom'
import {
  Activity, Zap, Bot, Bell, ArrowRight, LineChart,
  ShieldCheck, BookOpen, BadgeCheck,
} from 'lucide-react'
import { Wordmark as BrandWordmark } from '../components/ui/Logo'
import { STRATEGY_LIBRARY } from '../strategies/library'
import { cn } from '../lib/format'

export function LandingPage() {
  const navigate = useNavigate()

  // Pull three teaser strategies — prefer ones with performance data so
  // the social proof shows real numbers.
  const teasers = [...STRATEGY_LIBRARY]
    .sort((a, b) => (b.performance?.sample ?? 0) - (a.performance?.sample ?? 0))
    .slice(0, 3)

  return (
    <div className="h-screen overflow-y-auto bg-surface text-text-primary flex flex-col relative">
      {/* Atmospheric hero background — fal.ai-generated. The img is
          absolutely positioned and z-0; if the file doesn't exist
          (pre-generation), the onError handler hides it cleanly so
          the page falls back to the solid surface color. */}
      <img
        src="/hero-bg.png"
        alt=""
        aria-hidden="true"
        loading="eager"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        className="absolute top-0 left-0 right-0 h-[600px] w-full object-cover opacity-30 pointer-events-none z-0 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]"
      />
      <div className="relative z-10 flex flex-col flex-1">
      <header className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-border">
        <Wordmark />
        <nav className="flex items-center gap-2 md:gap-4">
          <a href="/proof" className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors">
            Track record
          </a>
          <a href="#features" className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors">
            Features
          </a>
          <button
            onClick={() => navigate('/library')}
            className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            Marketplace
          </button>
          <button
            onClick={() => navigate('/trade')}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-surface text-sm font-semibold rounded-md hover:opacity-90 transition-opacity cursor-pointer"
          >
            Open the Deck
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="flex-1 max-w-5xl w-full mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-12 text-center">
        <div className="inline-block mb-6 px-3 py-1 rounded-full border border-border bg-panel/60 text-[11px] uppercase tracking-[0.16em] text-text-muted font-mono">
          Research · Signals · Bots
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
          Research and bots,
          <br />
          <span className="text-accent">execute where you already trade.</span>
        </h1>
        <p className="text-base md:text-xl text-text-secondary mt-6 max-w-2xl mx-auto leading-relaxed">
          Eight signal sources, paper-trading bots, and a live track record for every fired
          signal — all in your browser. We deep-link out to Binance and Hyperliquid for
          execution, so you keep your liquidity, your risk tools, and your funds.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
          <button
            onClick={() => navigate('/trade')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-accent text-surface font-semibold rounded-md hover:opacity-90 transition-opacity cursor-pointer"
          >
            Open the Deck
            <ArrowRight className="w-4 h-4" />
          </button>
          <a
            href="/proof"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-panel border border-border text-text-primary font-semibold rounded-md hover:border-accent/40 transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-accent" />
            See the track record
          </a>
        </div>
        <div className="mt-4 text-[11px] text-text-muted flex flex-col sm:flex-row items-center justify-center gap-x-2 gap-y-1">
          <span>Free · No signup</span>
          <span className="hidden sm:inline">·</span>
          <span>
            Run paper bots out of the box
            <span className="text-text-secondary"> · </span>
            <a href="/profile" className="text-accent hover:underline">
              Connect a Binance API key
            </a>{' '}
            to go live (encrypted in your browser, never on our server).
          </span>
        </div>
      </section>

      {/* Differentiator strip */}
      <section className="max-w-6xl w-full mx-auto px-6 md:px-10 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DifferentiatorCard
            label="Verifiable"
            title="Every signal is timestamped and resolved"
            body="The same client-side ledger that drives /proof drives the workstation. Hit-rate is auditable, not marketed."
          />
          <DifferentiatorCard
            label="Auditable"
            title="Bots run in your browser, not on a server"
            body="Open the source, fork the bot, backtest it on your own data. The strategy library is a marketplace where every entry is a portable JSON manifest."
          />
          <DifferentiatorCard
            label="Venue-agnostic"
            title="Trade where you already have an account"
            body="No custody. No matching engine. One-tap deep links to Binance and Hyperliquid; bring your own API key for live mode if you want bots to execute."
          />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl w-full mx-auto px-6 md:px-10 py-12">
        <div className="text-center mb-10">
          <div className="text-[11px] uppercase tracking-[0.16em] text-text-muted mb-2 font-mono">
            What's in the box
          </div>
          <h2 className="text-2xl md:text-3xl font-bold">A research workstation for active traders.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            Icon={Activity}
            title="Multi-venue terminal"
            body="Switch instantly between Binance and Hyperliquid. Real-time chart, orderbook, and ticker streams for the top markets — auto-ranked, no manual list to maintain."
          />
          <FeatureCard
            Icon={Zap}
            title="Eight signal sources + confluence"
            body="Funding extremes, EMA crossovers, RSI, volatility spikes, whale flow, liquidation cascades, news, and on-chain whale wallets. When two or more align on direction, a confluence card surfaces the highest-confidence setup."
          />
          <FeatureCard
            Icon={LineChart}
            title="Hit-rate tracking"
            body="Every signal records its trigger price; we resolve 30 minutes later against the live mark. Per-source win rate, direction skew, best markets, recent outcomes — public at /proof."
          />
          <FeatureCard
            Icon={Bot}
            title="Paper-trading bots + replay"
            body="Configure bots that auto-execute on matching signals. Bar-by-bar replay with the chart's native playback. Risk caps auto-pause every bot when a daily loss, drawdown, or exposure threshold breaches."
          />
          <FeatureCard
            Icon={Bell}
            title="Multi-channel alerts"
            body="Browser notifications, in-app bell, optional sound ping for high-confidence fires, and Telegram bot integration for off-screen alerts. Per-source toggles and threshold sliders so you tune the noise."
          />
          <FeatureCard
            Icon={ShieldCheck}
            title="Encrypted client-side vault"
            body="When you do connect a Binance API key, it lives encrypted in your browser via AES-GCM + PBKDF2. We can't see it. Bots route trades through signed REST directly to the venue."
          />
        </div>
      </section>

      {/* Marketplace teaser */}
      <section className="max-w-6xl w-full mx-auto px-6 md:px-10 py-12">
        <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-text-muted mb-2 font-mono">
              Marketplace
            </div>
            <h2 className="text-2xl md:text-3xl font-bold">Strategies you can install in one click.</h2>
            <p className="text-sm text-text-secondary mt-2 max-w-2xl">
              Curated by the team and published by the community. Every entry runs in
              paper mode by default — backtest, replay, audit, then enable live.
            </p>
          </div>
          <button
            onClick={() => navigate('/library')}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-md border border-accent/40 text-accent text-sm font-mono uppercase tracking-[0.14em] hover:bg-accent-dim/30 transition-colors cursor-pointer"
          >
            Browse all
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {teasers.map(s => (
            <article
              key={s.id}
              onClick={() => navigate('/library')}
              className="bg-panel border border-border rounded-lg p-4 cursor-pointer hover:border-accent/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-text-primary">{s.name}</h3>
                {(s.kind ?? 'curated') === 'curated' ? (
                  <BadgeCheck className="w-3.5 h-3.5 text-accent shrink-0" />
                ) : (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface border border-border text-text-muted">
                    Community
                  </span>
                )}
              </div>
              <div className="text-[11px] text-text-muted mb-3">
                by {s.author.name}
                {s.author.handle && <span className="ml-1">{s.author.handle}</span>}
              </div>
              <p className="text-xs text-text-secondary leading-relaxed line-clamp-3 mb-3">
                {s.summary}
              </p>
              {s.performance ? (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-muted">{s.performance.sample} resolved</span>
                  <span className={cn(
                    'font-mono tabular-nums font-semibold',
                    s.performance.winRate >= 0.55 ? 'text-long' : 'text-text-secondary',
                  )}>
                    {Math.round(s.performance.winRate * 100)}% win rate
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-text-muted">Tracking starts on first run</div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* Why-we-exist */}
      <section className="max-w-4xl w-full mx-auto px-6 md:px-10 py-12">
        <div className="bg-panel border border-border rounded-xl p-6 md:p-10">
          <div className="text-[11px] uppercase tracking-[0.16em] text-accent mb-2 font-mono">
            Why TradingDek
          </div>
          <h2 className="text-xl md:text-2xl font-bold mb-4">
            We don't try to out-Binance Binance.
          </h2>
          <div className="text-text-secondary leading-relaxed space-y-3 text-sm md:text-base">
            <p>
              Every venue has a better order ticket than we could build. Their books are deeper,
              their latency is lower, their risk tools are better. So we don't compete on execution.
            </p>
            <p>
              We compete on <em className="text-text-primary not-italic font-semibold">research</em> —
              the part where every venue is bad. Multi-venue scanning, signal verification you can
              audit, paper-bot backtesting with a chart replay, a marketplace where strategies are
              version-controlled JSON. When you're ready to trade, you click out to your account.
            </p>
            <p className="text-text-muted text-sm">
              TradingView Premium + Coinglass Pro + 3Commas + a signal-feed subscription totals
              over $200/month. The free tier of TradingDek does most of what you actually use,
              with a track record that doesn't disappear behind a paywall.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl w-full mx-auto px-6 md:px-10 py-16 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">Ready to look at the deck?</h2>
        <p className="text-text-secondary mb-6">
          No signup, no API key needed to browse. Bots run paper-only until you connect.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <button
            onClick={() => navigate('/trade')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-accent text-surface font-semibold rounded-md hover:opacity-90 transition-opacity cursor-pointer"
          >
            Open the Deck
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/library')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-panel border border-border text-text-primary font-semibold rounded-md hover:border-accent/40 transition-colors cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            Browse the marketplace
          </button>
        </div>
      </section>

      <footer className="border-t border-border px-6 md:px-10 py-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <Wordmark size="sm" />
          <div className="flex items-center gap-4 text-[11px] text-text-muted flex-wrap justify-center md:justify-end">
            <a href="/proof" className="hover:text-text-primary transition-colors uppercase tracking-[0.16em] font-mono">
              Track record
            </a>
            <span>·</span>
            <button
              onClick={() => navigate('/library')}
              className="hover:text-text-primary transition-colors uppercase tracking-[0.16em] font-mono cursor-pointer"
            >
              Marketplace
            </button>
            <span>·</span>
            <a href="/legal/disclaimer" className="hover:text-text-primary transition-colors uppercase tracking-[0.16em] font-mono">
              Disclaimer
            </a>
            <span>·</span>
            <a href="/legal/privacy" className="hover:text-text-primary transition-colors uppercase tracking-[0.16em] font-mono">
              Privacy
            </a>
            <span>·</span>
            <a href="/legal/terms" className="hover:text-text-primary transition-colors uppercase tracking-[0.16em] font-mono">
              Terms
            </a>
            <span>·</span>
            <span>© 2026 TradingDek</span>
          </div>
        </div>
      </footer>
      </div>
    </div>
  )
}

function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return <BrandWordmark size={size === 'sm' ? 'sm' : 'lg'} />
}

function DifferentiatorCard({
  label, title, body,
}: {
  label: string
  title: string
  body: string
}) {
  return (
    <div className="bg-panel border border-border rounded-lg p-5 flex flex-col">
      <div className="text-[10px] uppercase tracking-[0.18em] text-accent font-mono font-semibold mb-2">
        {label}
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-2 leading-snug">{title}</h3>
      <p className="text-xs text-text-secondary leading-relaxed">{body}</p>
    </div>
  )
}

function FeatureCard({
  Icon, title, body,
}: {
  Icon: typeof Activity
  title: string
  body: string
}) {
  return (
    <div className="bg-panel border border-border rounded-xl p-6 hover:border-accent/40 transition-colors">
      <div className="w-9 h-9 rounded-md bg-accent-dim flex items-center justify-center mb-4">
        <Icon className="w-4 h-4 text-accent" />
      </div>
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
    </div>
  )
}
