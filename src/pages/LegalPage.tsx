/**
 * LegalPage — disclaimer, privacy, and terms in a single switchable surface.
 *
 * One route /legal/:doc handles all three so they share chrome and
 * navigation. Standalone (no AppShell) — these need to render even if
 * the workstation can't.
 *
 * IMPORTANT: copy is a starting skeleton. Have a lawyer review before
 * production launch. Trading is liability-heavy and template copy does
 * not fully protect.
 */

import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldAlert, ShieldCheck, FileText } from 'lucide-react'
import { Wordmark } from '../components/ui/Logo'
import { cn } from '../lib/format'
import { useDocumentMeta } from '../lib/documentMeta'

const LAST_UPDATED = '2026-05-05'

type Doc = 'disclaimer' | 'privacy' | 'terms'

const DOC_META: Record<Doc, { title: string; Icon: typeof ShieldAlert }> = {
  disclaimer: { title: 'Risk disclaimer', Icon: ShieldAlert },
  privacy: { title: 'Privacy policy', Icon: ShieldCheck },
  terms: { title: 'Terms of service', Icon: FileText },
}

export function LegalPage() {
  const { doc: docParam } = useParams<{ doc: string }>()
  const navigate = useNavigate()
  const doc: Doc = (docParam === 'privacy' || docParam === 'terms' || docParam === 'disclaimer')
    ? docParam
    : 'disclaimer'

  if (!docParam || !(['disclaimer', 'privacy', 'terms'] as const).includes(docParam as Doc)) {
    navigate(`/legal/${doc}`, { replace: true })
  }

  const { title, Icon } = DOC_META[doc]

  const META_DESC: Record<Doc, string> = {
    disclaimer:
      'TradingDek is a research tool, not a financial advisor. Trading involves substantial risk of loss; you assume full responsibility for any live-mode orders.',
    privacy:
      'How TradingDek handles data. We operate no servers that receive your personal data by default — encrypted API keys never leave your browser.',
    terms:
      'Service terms, acceptable use, and limitation of liability for TradingDek.',
  }
  useDocumentMeta({
    title: `TradingDek — ${title}`,
    description: META_DESC[doc],
    canonical: `/legal/${doc}`,
    ogImage: '/og.png',
    ogType: 'article',
  })

  return (
    <div className="min-h-screen bg-surface text-text-primary overflow-y-auto">
      <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <Wordmark size="sm" />
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft className="w-3 h-3" />
            Home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <section>
          <div className="flex items-center gap-2 mb-3 text-accent text-[11px] uppercase tracking-[0.18em] font-mono font-semibold">
            <Icon className="w-3.5 h-3.5" />
            Legal · last updated {LAST_UPDATED}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{title}</h1>
        </section>

        <nav className="flex flex-wrap gap-2 text-[11px] font-mono uppercase tracking-[0.14em]">
          {(['disclaimer', 'privacy', 'terms'] as const).map(d => (
            <Link
              key={d}
              to={`/legal/${d}`}
              className={cn(
                'px-3 py-1.5 rounded-md border transition-colors',
                d === doc
                  ? 'bg-accent text-surface border-accent'
                  : 'bg-panel border-border text-text-secondary hover:text-text-primary',
              )}
            >
              {DOC_META[d].title}
            </Link>
          ))}
        </nav>

        <article className="space-y-5 text-sm leading-relaxed text-text-secondary">
          {doc === 'disclaimer' && <DisclaimerCopy />}
          {doc === 'privacy' && <PrivacyCopy />}
          {doc === 'terms' && <TermsCopy />}
        </article>

        <footer className="border-t border-border pt-6 text-[11px] text-text-muted">
          Questions or corrections? Open an issue on the repository.
          This document is a starting skeleton; a qualified attorney
          should review before commercial deployment.
        </footer>
      </main>
    </div>
  )
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-text-primary">{heading}</h2>
      {children}
    </section>
  )
}

function DisclaimerCopy() {
  return (
    <>
      <p className="text-text-primary font-semibold">
        TradingDek is a research tool, not a financial advisor. Nothing on this
        site constitutes investment advice, a recommendation to buy or sell any
        asset, or a guarantee of returns.
      </p>
      <Section heading="Trading involves substantial risk of loss">
        <p>
          Cryptocurrency derivatives in particular carry the risk of losing
          your entire collateral and, on some venues, more than that. Past
          performance of any strategy — paper or live — is not predictive of
          future results. Sample sizes shown on this site are typically small.
        </p>
      </Section>
      <Section heading="Paper mode is fake; live mode is real">
        <p>
          By default, every bot runs in paper mode against the live signal
          feed. Paper trades have zero financial consequence. If you choose
          to connect a venue API key and flip a bot to live mode, the bot
          will place real signed orders against your real account using your
          real funds. You are solely responsible for those orders and any
          losses they cause.
        </p>
      </Section>
      <Section heading="Signals are imperfect">
        <p>
          Every signal source on this platform has a published hit rate at{' '}
          <Link to="/proof" className="text-accent hover:underline">/proof</Link>.
          That number is computed from the per-user ledger in your browser
          and reflects what those signals would have done in the past 30
          minutes of price action. It is not a forecast. Sources with fewer
          than 3 resolved trades are flagged as unqualified.
        </p>
      </Section>
      <Section heading="No fiduciary duty">
        <p>
          The operators of TradingDek have no fiduciary duty to you. We do
          not custody your funds, route your orders, or make decisions on
          your behalf. The bots execute autonomously in your browser based
          on rules you configure; we have no visibility into what they do.
        </p>
      </Section>
      <Section heading="Use at your own risk">
        <p>
          By using TradingDek you acknowledge that you have read this
          disclaimer, understand the risks of derivative trading, and accept
          full responsibility for any financial outcomes. If you do not
          understand any part of this, do not connect a venue key.
        </p>
      </Section>
    </>
  )
}

function PrivacyCopy() {
  return (
    <>
      <p>
        TradingDek is designed to collect as little as possible. The
        application is a static site that runs in your browser; we operate
        no servers that receive your personal data by default.
      </p>
      <Section heading="What stays in your browser only">
        <ul className="list-disc ml-5 space-y-1">
          <li>Bot configurations and trade history (localStorage key <code className="text-text-primary">tc-bots-v1</code>)</li>
          <li>Encrypted venue API keys (localStorage key <code className="text-text-primary">tc-creds-vault-v1</code>) — encrypted with your passphrase via AES-GCM + PBKDF2 (600k iterations)</li>
          <li>Signal performance ledger (<code className="text-text-primary">tc-signal-performance-v1</code>)</li>
          <li>Watchlist, follow list, settings, risk caps, anonymous device id</li>
        </ul>
        <p>
          None of the above is transmitted to any server we operate. You can
          inspect each key with browser DevTools.
        </p>
      </Section>
      <Section heading="What is transmitted to third parties">
        <ul className="list-disc ml-5 space-y-1">
          <li>
            <strong>Venue API calls.</strong> The browser talks directly to
            public Binance / Hyperliquid endpoints for market data, and to
            their signed REST endpoints (using your unlocked API key) for
            account state and orders. Their privacy policies apply.
          </li>
          <li>
            <strong>Optional Telegram alerts.</strong> If you configure a bot
            token, signal alerts are sent through Telegram's bot API directly
            from your browser. Telegram's privacy policy applies.
          </li>
          <li>
            <strong>Optional CryptoPanic news feed.</strong> If you set a
            token, the browser fetches headlines directly from CryptoPanic.
          </li>
        </ul>
      </Section>
      <Section heading="Cookies and tracking">
        <p>
          We do not use cookies. We do not run analytics. We do not embed
          third-party trackers, ad networks, or pixels. If/when analytics
          are added, they will be opt-in, anonymous, and disclosed here.
        </p>
      </Section>
      <Section heading="Children">
        <p>
          TradingDek is not intended for users under 18. Cryptocurrency
          derivative trading is restricted by jurisdiction in many places;
          consult local law before connecting a venue key.
        </p>
      </Section>
      <Section heading="Your rights">
        <p>
          Because we hold no server-side data about you, "data deletion"
          consists of clearing your browser storage for this site. Use
          Settings → Wipe all client storage, or DevTools → Application →
          Clear storage.
        </p>
      </Section>
    </>
  )
}

function TermsCopy() {
  return (
    <>
      <p>
        By accessing TradingDek you agree to these terms. If you do not
        agree, do not use the site.
      </p>
      <Section heading="The service">
        <p>
          TradingDek is provided "as is" without warranty of any kind. We
          make no representation that the service will be uninterrupted,
          error-free, secure, or fit for any particular purpose. Signal
          accuracy, bot decisions, venue connectivity, and price data may
          fail at any time.
        </p>
      </Section>
      <Section heading="Acceptable use">
        <ul className="list-disc ml-5 space-y-1">
          <li>Do not use TradingDek to manipulate markets, including but not limited to spoofing, layering, or wash trading.</li>
          <li>Do not attempt to abuse venue APIs through TradingDek; the venues' terms apply in addition to ours.</li>
          <li>Do not republish curated strategies or content under false attribution.</li>
          <li>Do not attempt to reverse-engineer the credentials vault to recover keys belonging to other users.</li>
        </ul>
      </Section>
      <Section heading="Limitation of liability">
        <p className="text-text-primary font-semibold">
          To the maximum extent permitted by law, the operators of
          TradingDek are not liable for any direct, indirect, incidental,
          consequential, or punitive damages — including but not limited to
          financial losses arising from trading decisions, signal accuracy,
          bot behaviour, venue outages, key compromise, or service
          interruption.
        </p>
      </Section>
      <Section heading="Indemnification">
        <p>
          You agree to indemnify and hold harmless the operators of
          TradingDek from any claim arising from your use of the service,
          including trades you authorise, strategies you publish, and any
          violation of these terms or applicable law.
        </p>
      </Section>
      <Section heading="Changes to the service">
        <p>
          We may modify, suspend, or discontinue any part of TradingDek at
          any time without notice. Bot configurations and trade history
          stored in your browser remain yours; we have no obligation to
          preserve server-side state because there is no server-side state.
        </p>
      </Section>
      <Section heading="Governing law">
        <p>
          Jurisdiction: to be determined. Until specified, disputes are
          governed by the law of the operator's principal place of business.
        </p>
      </Section>
    </>
  )
}
