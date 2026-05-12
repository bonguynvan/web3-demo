/**
 * NotFoundPage — branded 404 that beats the silent redirect.
 *
 * Standalone (no AppShell) so it renders for any unknown path including
 * deep links into removed routes. Uses the same chrome as legal/learn
 * pages — wordmark, back-to-home link, accent type — plus a small set
 * of jump links to the surfaces most-visited 404s actually want.
 */

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Compass, BookOpen, ShieldCheck, BarChart3 } from 'lucide-react'
import { Wordmark } from '../components/ui/Logo'
import { useDocumentMeta } from '../lib/documentMeta'

export function NotFoundPage() {
  useDocumentMeta({
    title: 'TradingDek — page not found',
    description: 'The page you were looking for does not exist on TradingDek. Try the workstation, the strategy library, or the public track record.',
    canonical: '/404',
  })

  // Mark the page as noindex so search engines stop indexing dead links.
  // useDocumentMeta has no `robots` field; mutate directly and restore on
  // unmount so other routes keep their default indexable state.
  useEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const prev = existing?.content ?? null
    let el = existing
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute('name', 'robots')
      document.head.appendChild(el)
    }
    el.content = 'noindex,follow'
    return () => {
      if (prev === null) {
        el?.remove()
      } else if (el) {
        el.content = prev
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-surface text-text-primary overflow-y-auto">
      <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
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

      <main className="max-w-3xl mx-auto px-6 py-16 md:py-24 space-y-10">
        <section>
          <div className="flex items-center gap-2 mb-4 text-accent text-[11px] uppercase tracking-[0.18em] font-mono font-semibold">
            <Compass className="w-3.5 h-3.5" />
            404 · off the chart
          </div>
          <h1 className="text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
            This page<br />doesn't exist.
          </h1>
          <p className="text-text-secondary text-sm md:text-base leading-relaxed mt-5 max-w-xl">
            The URL you followed is either stale, mistyped, or pointing at a
            route we retired during the pivot. Nothing was lost — pick a
            destination below or head back to the workstation.
          </p>
        </section>

        <section className="grid sm:grid-cols-3 gap-3">
          <JumpCard
            to="/trade"
            Icon={BarChart3}
            title="Workstation"
            body="Chart, signals, and bots."
          />
          <JumpCard
            to="/library"
            Icon={BookOpen}
            title="Strategy library"
            body="Browse curated bots."
          />
          <JumpCard
            to="/proof"
            Icon={ShieldCheck}
            title="Public track record"
            body="Live hit rates."
          />
        </section>

        <section className="border-t border-border pt-6 text-[11px] text-text-muted">
          If you arrived here from a TradingDek link that should work, please{' '}
          <span className="text-text-secondary">use the feedback widget</span> in
          the bottom-left and we'll fix it.
        </section>
      </main>
    </div>
  )
}

function JumpCard({
  to, Icon, title, body,
}: {
  to: string
  Icon: typeof Compass
  title: string
  body: string
}) {
  return (
    <Link
      to={to}
      className="group rounded-lg border border-border bg-panel/40 hover:border-accent/60 hover:bg-panel transition-colors p-4 block"
    >
      <div className="w-7 h-7 rounded-md bg-accent-dim text-accent flex items-center justify-center mb-3 group-hover:bg-accent group-hover:text-surface transition-colors">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="text-[11px] text-text-muted leading-snug mt-0.5">{body}</div>
    </Link>
  )
}
