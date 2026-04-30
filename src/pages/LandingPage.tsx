/**
 * LandingPage — marketing page at /, separate from the AppShell-wrapped routes.
 *
 * MVP: hero + features + email capture + footer. Email goes to localStorage
 * for now; migrate to a real ESP (Loops, Resend, Buttondown) when traffic
 * justifies it.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Zap, Bot, Bell, ArrowRight, BarChart3 } from 'lucide-react'

const WAITLIST_KEY = 'tradingdek-waitlist'

export function LandingPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email')
      return
    }

    // Local backup — survives even if the network call fails.
    try {
      const raw = localStorage.getItem(WAITLIST_KEY)
      const list = raw ? JSON.parse(raw) as { email: string; ts: number }[] : []
      if (!list.some(e => e.email.toLowerCase() === trimmed.toLowerCase())) {
        list.push({ email: trimmed, ts: Date.now() })
        localStorage.setItem(WAITLIST_KEY, JSON.stringify(list))
      }
    } catch { /* full or denied */ }

    // Optional ESP / form-handler endpoint. Set VITE_WAITLIST_ENDPOINT to
    // a Formspree, Buttondown, Loops, or custom URL that accepts a JSON
    // POST body { email }. If unset, we keep the localStorage-only path.
    const endpoint = import.meta.env.VITE_WAITLIST_ENDPOINT
    if (endpoint) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ email: trimmed }),
        })
        if (!res.ok) {
          setError('Could not subscribe right now — please try again')
          return
        }
      } catch {
        setError('Network issue — please try again')
        return
      }
    }
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary flex flex-col">
      {/* Top nav */}
      <header className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-border">
        <Wordmark />
        <nav className="flex items-center gap-2 md:gap-4">
          <a
            href="#features"
            className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Features
          </a>
          <a
            href="#waitlist"
            className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Waitlist
          </a>
          <button
            onClick={() => navigate('/trade')}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm font-semibold rounded-md hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Open the Deck
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="flex-1 max-w-5xl w-full mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-12 text-center">
        <div className="inline-block mb-6 px-3 py-1 rounded-full border border-border bg-panel/60 text-[11px] uppercase tracking-wider text-text-muted">
          Multi-venue · Signals · Paper bots
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
          Your trading deck.
          <br />
          <span className="text-accent">One screen.</span>
        </h1>
        <p className="text-base md:text-xl text-text-secondary mt-6 max-w-2xl mx-auto leading-relaxed">
          Live signal scanner and paper-trading bots across Binance and Hyperliquid.
          Everything an active trader needs in one place — chart, orderbook, signals, and execution.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
          <button
            onClick={() => navigate('/trade')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white font-semibold rounded-md hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Open the Deck
            <ArrowRight className="w-4 h-4" />
          </button>
          <a
            href="#features"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-panel border border-border text-text-primary font-semibold rounded-md hover:bg-panel-light transition-colors"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="max-w-6xl w-full mx-auto px-6 md:px-10 py-12">
        <div className="text-center mb-10">
          <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">
            What's in the box
          </div>
          <h2 className="text-2xl md:text-3xl font-bold">A trader's full workstation.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FeatureCard
            Icon={Activity}
            title="Multi-venue terminal"
            body="Switch instantly between Binance and Hyperliquid. Real-time chart, orderbook, and ticker streams for the top markets by 24h volume — auto-ranked, no manual list to maintain."
          />
          <FeatureCard
            Icon={Zap}
            title="Five signal sources + confluence"
            body="Funding extremes, EMA crossovers, RSI, volatility spikes, whale flow. When two or more sources align on the same market, a confluence card surfaces the highest-confidence trade."
          />
          <FeatureCard
            Icon={Bot}
            title="Paper-trading bots"
            body="Configure bots that auto-execute on matching signals. Portfolio dashboard with live unrealized PnL, win rate, top/worst bot, and equity-curve sparkline. Validate strategy before risking real capital."
          />
          <FeatureCard
            Icon={Bell}
            title="Browser + in-app alerts"
            body="High-confidence signals ping you whether you're on the page or not. In-app notification bell keeps the full history. Toggle on or off per session."
          />
        </div>
      </section>

      {/* Why-we-exist block */}
      <section className="max-w-4xl w-full mx-auto px-6 md:px-10 py-12">
        <div className="bg-panel border border-border rounded-xl p-6 md:p-10">
          <div className="text-[11px] uppercase tracking-wider text-accent mb-2">Why TradingDek</div>
          <h2 className="text-xl md:text-2xl font-bold mb-4">Pro-grade tooling without the pro-grade bill.</h2>
          <p className="text-text-secondary leading-relaxed">
            Tradingview Premium, Coinglass Pro, 3Commas, and signal-feed subscriptions total over $200/month.
            TradingDek combines the parts active traders actually use — multi-venue charts, real-time
            signals, and paper-bot validation — into a single, focused workstation. Free for the first
            wave; wallet-signed live trading lands next.
          </p>
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="max-w-xl w-full mx-auto px-6 md:px-10 py-16">
        <div className="text-center mb-6">
          <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">Stay in the loop</div>
          <h2 className="text-2xl md:text-3xl font-bold">Get the live-trading invite.</h2>
          <p className="text-text-secondary mt-3">
            One email when wallet-signed trading goes live and when new signal sources ship. No spam.
          </p>
        </div>
        {submitted ? (
          <div className="bg-long/10 border border-long/30 rounded-md p-4 text-center text-long font-medium">
            Thanks — you're on the list.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="flex-1 bg-panel border border-border px-4 py-3 rounded-md text-text-primary outline-none focus:border-accent transition-colors"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-accent text-white font-semibold rounded-md hover:bg-accent/90 transition-colors cursor-pointer"
            >
              Subscribe
            </button>
          </form>
        )}
        {error && (
          <div className="mt-2 text-xs text-short">{error}</div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 md:px-10 py-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <Wordmark size="sm" />
          <div className="text-[11px] text-text-muted text-center md:text-right">
            © 2026 TradingDek · paper mode · live wallet trading coming soon
          </div>
        </div>
      </footer>
    </div>
  )
}

function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const text = size === 'sm' ? 'text-base' : 'text-xl'
  const icon = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const wrap = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8'
  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center justify-center rounded-md bg-accent text-white ${wrap}`}>
        <BarChart3 className={icon} />
      </div>
      <span className={`font-bold tracking-tight ${text}`}>
        Trading<span className="text-accent">Dek</span>
      </span>
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
