/**
 * LearnPage — explainer for every signal source.
 *
 * Standalone (no AppShell). Single page with anchor-targetable
 * sections so signal cards in the workstation can deep-link to a
 * given source via /learn#funding etc.
 *
 * Each section follows the same shape:
 *   - one-sentence definition
 *   - when this signal fires (mechanic)
 *   - when to trust it / when to be skeptical
 *   - direction interpretation (long vs short reasoning)
 */

import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowLeft, ExternalLink, Zap, Activity, LineChart, Waves, AlertOctagon,
  Wallet, Megaphone, Layers, Sparkles,
} from 'lucide-react'
import { Wordmark } from '../components/ui/Logo'
import { useDocumentMeta } from '../lib/documentMeta'

interface SourceCard {
  id: string
  title: string
  Icon: typeof Activity
  oneliner: string
  body: React.ReactNode
}

const SOURCES: SourceCard[] = [
  {
    id: 'funding',
    title: 'Funding extremes',
    Icon: Waves,
    oneliner: 'Crowded perp positioning is paying to stay open — fade it.',
    body: (
      <>
        <p>
          Perpetual swaps periodically settle a <em>funding rate</em> between longs
          and shorts. When the rate is strongly positive, longs are paying shorts —
          a signal that long positioning is crowded. Strongly negative is the inverse.
        </p>
        <p>
          <strong>Fires</strong> when a market's funding rate magnitude crosses
          <code className="text-text-primary"> ±0.01% / hr</code> (tunable in
          Signal Sources). Direction is contrarian: positive funding fires a short
          signal; negative funding fires a long signal. The strategy: get paid to
          fade the herd, not chase it.
        </p>
        <p>
          <strong>Trust when:</strong> the cross has held for several hours and
          appears across multiple perp venues. <strong>Skeptical when:</strong>{' '}
          a single venue spikes mid-cycle (often a single whale entering),
          or when there is an obvious catalyst (news event) that justifies the
          imbalance.
        </p>
      </>
    ),
  },
  {
    id: 'crossover',
    title: 'EMA crossover',
    Icon: LineChart,
    oneliner: '9-period EMA crosses 21-period EMA on a closed bar.',
    body: (
      <>
        <p>
          Exponential moving averages weight recent prices more heavily than older
          ones. A short EMA (9) crossing above a longer EMA (21) is the classic
          momentum-flip signal; the reverse marks downside momentum.
        </p>
        <p>
          <strong>Fires</strong> only on closed bars (no flickering on intra-bar
          wicks) and only when the cross is meaningful — within 0.5% of price.
          Direction: 9-above-21 fires long; 9-below-21 fires short.
        </p>
        <p>
          <strong>Trust when:</strong> the cross happens after a clean trend (not
          inside a chop range) and volume confirms. <strong>Skeptical when:</strong>{' '}
          the market is ranging; EMA crossovers in chop produce a stream of
          false signals (whipsaw).
        </p>
      </>
    ),
  },
  {
    id: 'rsi',
    title: 'RSI extremes',
    Icon: Activity,
    oneliner: 'Wilder(14) crosses an overbought / oversold band.',
    body: (
      <>
        <p>
          Relative Strength Index measures the magnitude of recent up-moves vs
          down-moves on a 0–100 scale. Below 30 = oversold, above 70 = overbought.
          Cross-back signals (out of 30 going up; out of 70 going down) often
          precede mean-reversion bounces.
        </p>
        <p>
          <strong>Fires</strong> when RSI crosses back into the 30–70 zone after
          a visit to either extreme. Direction is mean-reversion: out-of-oversold
          fires long; out-of-overbought fires short.
        </p>
        <p>
          <strong>Trust when:</strong> the underlying is not trending hard — RSI
          mean-reversion works in chop, fails in trends. <strong>Skeptical
          when:</strong> RSI stays pinned at an extreme for many bars (strong
          trends ignore RSI). Cross-up after multi-day persistence below 30 is
          stronger than a quick dip.
        </p>
      </>
    ),
  },
  {
    id: 'volatility',
    title: 'Volatility spike',
    Icon: Zap,
    oneliner: `A single bar's range is much larger than the recent baseline.`,
    body: (
      <>
        <p>
          When one bar's high-minus-low is ≥3× the trailing 20-bar average range,
          something happened — a liquidation, a news spike, a large market order.
          We surface it as a signal in the direction of the bar's close.
        </p>
        <p>
          <strong>Fires</strong> on the first closed bar whose range exceeds
          the threshold (default 3×, slider in Signal Sources). Direction
          follows the bar: green bar fires long; red bar fires short.
        </p>
        <p>
          <strong>Trust when:</strong> the spike comes with volume confirmation.{' '}
          <strong>Skeptical when:</strong> the spike is just a wick (open and
          close are close together inside the range) — the move was reversed,
          not sustained.
        </p>
      </>
    ),
  },
  {
    id: 'liquidation',
    title: 'Liquidation cascade',
    Icon: AlertOctagon,
    oneliner: 'Aggressive same-side market fills clearing forced positions.',
    body: (
      <>
        <p>
          Liquidations happen when leveraged positions get forcibly closed by
          the venue. A cluster of same-side liquidations in a short window
          usually pushes price further in the liquidation direction — short
          squeezes and long unwinds are the textbook examples.
        </p>
        <p>
          <strong>Fires</strong> when 5+ aggressive same-side fills totaling
          ≥$200k notional happen within 30 seconds. Direction: long
          liquidations cascade down (short signal); short liquidations cascade
          up (long signal).
        </p>
        <p>
          <strong>Trust when:</strong> the cascade comes with a structural break
          (key support / resistance broken). <strong>Skeptical when:</strong>{' '}
          the cascade fully retraces within minutes — that is a bear / bull trap.
        </p>
      </>
    ),
  },
  {
    id: 'whale',
    title: 'Whale flow',
    Icon: Wallet,
    oneliner: 'Large directional taker prints over a short window.',
    body: (
      <>
        <p>
          Sums aggressive taker volume over a 60-second window. When notional
          exceeds $100k and one side accounts for ≥60% of that flow, the
          imbalance is the signal.
        </p>
        <p>
          <strong>Fires</strong> when the threshold is met. Direction follows
          the dominant side: heavy taker buys fire long; heavy taker sells fire short.
        </p>
        <p>
          <strong>Trust when:</strong> the imbalance persists for several
          windows in a row — single bursts can be one trader hitting a stop.{' '}
          <strong>Skeptical when:</strong> the move comes during a thin period
          (early Asia hours, holidays) when one large order can move price
          without representing real informed flow.
        </p>
      </>
    ),
  },
  {
    id: 'news',
    title: 'News catalyst',
    Icon: Megaphone,
    oneliner: 'Important headline from a watched feed for a tracked market.',
    body: (
      <>
        <p>
          Optional source — only fires when{' '}
          <code className="text-text-primary">VITE_CRYPTOPANIC_TOKEN</code> is set.
          Pulls "important" headlines from CryptoPanic, filters to tokens in
          the top markets, and emits a signal with the sentiment direction.
        </p>
        <p>
          <strong>Fires</strong> on a new important headline within the last
          15 minutes. Direction: bullish-sentiment headlines fire long;
          bearish-sentiment headlines fire short.
        </p>
        <p>
          <strong>Trust when:</strong> the headline reflects a real binary
          outcome (regulatory ruling, exchange listing, exploit confirmed).{' '}
          <strong>Skeptical when:</strong> it is clickbait — most "news" is
          already priced in by the time CryptoPanic flags it.
        </p>
      </>
    ),
  },
  {
    id: 'on-chain-whale',
    title: 'On-chain whale wallet',
    Icon: Wallet,
    oneliner: 'A tracked Hyperliquid wallet opens a perp ≥ $50k notional.',
    body: (
      <>
        <p>
          Optional source — set{' '}
          <code className="text-text-primary">VITE_HL_WHALE_WALLETS</code> to a
          comma-separated list of Hyperliquid addresses. Hyperliquid's{' '}
          <code className="text-text-primary">userFills</code> endpoint is
          fully public on-chain, so no API key is needed beyond knowing whose
          activity to watch.
        </p>
        <p>
          <strong>Fires</strong> on the wallet's first eligible position open.
          Direction mirrors the wallet's trade.
        </p>
        <p>
          <strong>Trust when:</strong> the wallet has a consistent prior track
          record (look it up on hyperdash.info or similar). <strong>Skeptical
          when:</strong> the wallet routinely both-sides the same market
          (market-makers, arb desks) — their flow is not directional information.
        </p>
      </>
    ),
  },
  {
    id: 'confluence',
    title: 'Confluence',
    Icon: Layers,
    oneliner: 'Two or more independent sources agree on direction.',
    body: (
      <>
        <p>
          Synthesizer over all the above. When ≥2 sources fire signals on the
          same market in the same direction inside a short window, a confluence
          signal is emitted with elevated confidence (averaged across
          contributors).
        </p>
        <p>
          <strong>Fires</strong> when the threshold (default 2 sources) is
          reached. Direction matches the agreeing sources. Confidence is
          weighted by the average underlying confidence.
        </p>
        <p>
          <strong>Trust when:</strong> sources are genuinely independent
          (RSI + funding = different signal families) vs correlated (volatility +
          liquidation often co-fire on the same event — count as one).{' '}
          <strong>Skeptical when:</strong> the agreement comes from sources
          that always co-move; check{' '}
          <Link to="/proof" className="text-accent hover:underline">/proof</Link>
          {' '}for the historical hit rate of each.
        </p>
      </>
    ),
  },
]

export function LearnPage() {
  const { hash } = useLocation()

  useDocumentMeta({
    title: 'TradingDek — Learn the signal sources',
    description: `How each of TradingDek's eight signal sources works, when to trust it, and when to be skeptical. Bookmark for reference next time a signal fires.`,
    canonical: '/learn',
    ogImage: '/og.png',
  })

  // Smooth-scroll to the requested anchor on first paint and on hash changes.
  useEffect(() => {
    if (!hash) return
    const id = hash.slice(1)
    const el = document.getElementById(id)
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    }
  }, [hash])

  return (
    <div className="min-h-screen bg-surface text-text-primary overflow-y-auto">
      <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <Wordmark size="sm" />
          </Link>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <Link to="/proof" className="hover:text-text-primary transition-colors">
              Track record
            </Link>
            <Link to="/" className="flex items-center gap-1.5 hover:text-text-primary transition-colors">
              <ArrowLeft className="w-3 h-3" />
              Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <section>
          <div className="flex items-center gap-2 mb-3 text-accent text-[11px] uppercase tracking-[0.18em] font-mono font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Learn the signal sources
          </div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight mb-4">
            What each signal means,<br />
            and when to trust it.
          </h1>
          <p className="text-text-secondary text-sm md:text-base leading-relaxed max-w-2xl">
            TradingDek fires signals from eight independent sources. Each works
            differently and fails differently. Bookmark this page — next time a
            signal fires, the explainer is one anchor away.
          </p>
        </section>

        <nav className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {SOURCES.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-panel border border-border text-xs text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
            >
              <s.Icon className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate">{s.title}</span>
            </a>
          ))}
        </nav>

        {SOURCES.map(s => (
          <article
            key={s.id}
            id={s.id}
            className="scroll-mt-20 border-t border-border pt-8"
          >
            <header className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-md bg-accent-dim flex items-center justify-center shrink-0">
                <s.Icon className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight">{s.title}</h2>
                <p className="text-[12px] text-text-muted leading-snug">{s.oneliner}</p>
              </div>
            </header>
            <div className="text-sm leading-relaxed text-text-secondary space-y-3 max-w-2xl">
              {s.body}
            </div>
          </article>
        ))}

        <section className="border-t border-border pt-6 flex items-center justify-between flex-wrap gap-4">
          <Link to="/" className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft className="w-3 h-3" />
            Back to home
          </Link>
          <Link
            to="/proof"
            className="flex items-center gap-1.5 text-accent hover:underline text-xs font-mono uppercase tracking-[0.16em]"
          >
            See each source's hit rate
            <ExternalLink className="w-3 h-3" />
          </Link>
        </section>
      </main>
    </div>
  )
}
