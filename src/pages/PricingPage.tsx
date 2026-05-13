/**
 * PricingPage — public pricing surface.
 *
 * Mirrors the four plans inside UpgradeModal (the modal is the
 * conversion point inside the app; this page is the discovery point
 * outside). Standalone (no AppShell) so visitors land here from
 * search/social and see chrome-free pricing fast.
 *
 * Copy is intentionally honest about the "days stack, no auto-renew"
 * model — crypto users hate surprise charges, and this is a real
 * differentiator from card-on-file SaaS.
 */

import { Link } from 'react-router-dom'
import { ArrowLeft, Sparkles, Wallet, Zap, ShieldCheck, Check } from 'lucide-react'
import { Wordmark } from '../components/ui/Logo'
import { useDocumentMeta } from '../lib/documentMeta'
import { cn } from '../lib/format'

interface PlanRow {
  label: string
  amount: string
  detail: string
  days: number | null
  featured?: boolean
}

const PLANS: PlanRow[] = [
  { label: 'Free',              amount: '$0',  detail: '1 bot · public signals · paper-only',                     days: null },
  { label: '14-day trial',      amount: '$0',  detail: 'Full Pro for 14 days on first wallet sign-in.',          days: 14 },
  { label: '30 days Pro',       amount: '$5',  detail: '~$0.17/day. Days stack with any other purchase.',        days: 30 },
  { label: '180 days Pro',      amount: '$25', detail: '~$0.14/day. Most popular.',                              days: 180, featured: true },
  { label: '365 days Pro',      amount: '$50', detail: '~$0.14/day. Best value.',                                days: 365 },
  { label: '$5 balance (paygo)',amount: '$5',  detail: 'Burns $0.10/day while Pro is toggled on. Top-up anytime.',days: null },
]

const PRO_FEATURES = [
  'Unlimited bots (Free is capped at 1)',
  'Telegram alerts for signals at ≥60% confidence',
  'Whale-wallet + on-chain flow signal sources',
  'News-catalyst signal feed (CryptoPanic-backed)',
  'Faster polling on candle + ticker data',
  'Strategy publishing in the public marketplace (when shipped)',
]

export function PricingPage() {
  useDocumentMeta({
    title: 'TradingDek — Pricing',
    description: 'Pay-as-you-go or stacking subscriptions in crypto (USDT, BTC, ETH, SOL). No auto-renew, no card on file, 14-day free trial on first sign-in.',
    canonical: '/pricing',
    ogImage: '/og.png',
  })

  return (
    <div className="min-h-screen bg-surface text-text-primary overflow-y-auto">
      <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <Wordmark size="sm" />
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Home
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 md:py-20 space-y-12">
        <section className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 mb-4 text-accent text-[11px] uppercase tracking-[0.18em] font-mono font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Pricing
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight">
            Pay in crypto.
            <br />
            <span className="text-accent">No auto-renew.</span>
          </h1>
          <p className="text-text-secondary text-sm md:text-base leading-relaxed mt-5">
            14-day Pro trial on your first wallet sign-in. After that you choose: top up
            a balance and burn it daily, or buy a chunk of days outright. Days
            <strong className="text-text-primary"> stack</strong>. We never auto-charge.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PLANS.map(p => (
            <div
              key={p.label}
              className={cn(
                'rounded-lg p-5 border bg-panel/40 flex flex-col',
                p.featured ? 'border-accent/60 bg-accent-dim/40 shadow-lg shadow-accent/10' : 'border-border',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-text-primary">{p.label}</span>
                {p.featured && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase tracking-[0.14em] text-accent">
                    <Zap className="w-2.5 h-2.5" /> Popular
                  </span>
                )}
              </div>
              <div className="text-3xl font-mono font-bold text-text-primary mb-1">{p.amount}</div>
              {p.days !== null && (
                <div className="text-[11px] font-mono text-text-muted mb-3">{p.days} days</div>
              )}
              <p className="text-[12px] text-text-secondary leading-relaxed">{p.detail}</p>
            </div>
          ))}
        </section>

        <section className="grid md:grid-cols-2 gap-8 items-start border-t border-border pt-10">
          <div>
            <h2 className="text-xl font-semibold mb-3">What's in Pro</h2>
            <ul className="space-y-2 text-sm text-text-secondary">
              {PRO_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-accent shrink-0 mt-1" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4 text-sm text-text-secondary">
            <h2 className="text-xl font-semibold text-text-primary">How payment works</h2>
            <div className="flex items-start gap-2.5">
              <Wallet className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <p>
                Sign in with any EVM wallet (MetaMask, Rabby, …). No email, no card,
                no password. We see your wallet address and nothing else.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <p>
                Pick a plan in-app. Get redirected to a hosted crypto checkout
                (NOWPayments). Pay in USDT, BTC, ETH, SOL, and a dozen more.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <p>
                Days are credited the moment your payment confirms on-chain. There's
                no recurring charge, no card on file, no auto-renew.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-border pt-8 text-center space-y-3">
          <h2 className="text-2xl font-semibold">Ready to try?</h2>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            Open the workstation — your 14-day trial starts the moment you sign in
            with a wallet.
          </p>
          <Link
            to="/trade"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-surface text-sm font-semibold rounded-md hover:opacity-90 transition-opacity"
          >
            Open the Deck
            <ArrowLeft className="w-3 h-3 rotate-180" />
          </Link>
        </section>

        <footer className="border-t border-border pt-6 flex items-center justify-between text-[11px] text-text-muted">
          <Link to="/" className="hover:text-text-primary transition-colors">
            ← Back home
          </Link>
          <div className="flex gap-3">
            <Link to="/legal/disclaimer" className="hover:text-text-primary transition-colors">Disclaimer</Link>
            <Link to="/legal/privacy" className="hover:text-text-primary transition-colors">Privacy</Link>
            <Link to="/legal/terms" className="hover:text-text-primary transition-colors">Terms</Link>
          </div>
        </footer>
      </main>
    </div>
  )
}
