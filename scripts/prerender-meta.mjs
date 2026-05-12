#!/usr/bin/env node
/**
 * prerender-meta — emit per-route HTML files with route-specific meta tags.
 *
 * Why: useDocumentMeta() rewrites <title>/<meta>/<link rel=canonical> in
 * the running browser, but social-card crawlers (Twitter, Facebook,
 * LinkedIn, Slack) and some search-engine fetchers DON'T execute JS.
 * They see whatever ships in the raw HTML response.
 *
 * Solution: after `vite build` emits dist/index.html, this script
 * copies that file to dist/<route>/index.html with the route's meta
 * tags substituted in. Static hosts serve the more specific path
 * first, falling back to dist/index.html for SPA routes that aren't
 * pre-rendered (e.g. /trade, /author/:handle, /portfolio).
 *
 * No bundler dependencies. Vite copies all of `public/` verbatim;
 * this script only touches the freshly-emitted HTML.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')

// Production origin used inside og:url + link[rel=canonical] absolute URLs.
// Override at build time with: SITE_ORIGIN=https://yourdomain.com pnpm build
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://tradingdek.com'

const ROUTES = [
  // The root route is already the file Vite emitted; we re-write the
  // tags so the defaults match the post-pivot positioning rather than
  // the legacy ones in source-controlled index.html.
  {
    path: '/',
    out: 'index.html',
    title: 'TradingDek — Research and bots, executed where you already trade',
    description:
      'Eight signal sources, paper-trading bots, and a live, auditable track record for every fired signal. Deep-links into Binance and Hyperliquid for execution — your liquidity, your risk tools, your funds.',
    ogImage: '/og.png',
    ogType: 'website',
  },
  {
    path: '/proof',
    out: 'proof/index.html',
    title: 'TradingDek — Public signal track record',
    description:
      'Every signal we fire is timestamped and resolved 30 minutes later against actual price. No back-tested cherry-picking — falsifiable hit rates per source, generated from a client-side ledger.',
    ogImage: '/proof-og.png',
    ogType: 'website',
  },
  {
    path: '/library',
    out: 'library/index.html',
    title: 'TradingDek — Strategy marketplace',
    description:
      'Curated and community bots, installable in one click. Every entry runs in paper mode by default — backtest, replay, audit, then enable live.',
    ogImage: '/og.png',
    ogType: 'website',
  },
  {
    path: '/legal/disclaimer',
    out: 'legal/disclaimer/index.html',
    title: 'TradingDek — Risk disclaimer',
    description:
      'TradingDek is a research tool, not a financial advisor. Trading involves substantial risk of loss.',
    ogImage: '/og.png',
    ogType: 'article',
  },
  {
    path: '/legal/privacy',
    out: 'legal/privacy/index.html',
    title: 'TradingDek — Privacy policy',
    description:
      'How TradingDek handles data. We operate no servers that receive your personal data by default — encrypted API keys never leave your browser.',
    ogImage: '/og.png',
    ogType: 'article',
  },
  {
    path: '/legal/terms',
    out: 'legal/terms/index.html',
    title: 'TradingDek — Terms of service',
    description:
      'Service terms, acceptable use, and limitation of liability for TradingDek.',
    ogImage: '/og.png',
    ogType: 'article',
  },
]

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function rewriteHead(html, route) {
  const absImage = `${SITE_ORIGIN}${route.ogImage}`
  const absUrl = `${SITE_ORIGIN}${route.path}`

  let out = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escape(route.title)}</title>`,
  )
  // Replace each named meta. If a tag is missing we'll inject it; if
  // present we update content="" in place.
  const replacements = [
    { selector: /<meta name="description"[^>]*>/, replacement: `<meta name="description" content="${escape(route.description)}" />` },
    { selector: /<meta property="og:title"[^>]*>/, replacement: `<meta property="og:title" content="${escape(route.title)}" />` },
    { selector: /<meta property="og:description"[^>]*>/, replacement: `<meta property="og:description" content="${escape(route.description)}" />` },
    { selector: /<meta property="og:type"[^>]*>/, replacement: `<meta property="og:type" content="${route.ogType}" />` },
    { selector: /<meta property="og:image"(?![^>]*:width|[^>]*:height)[^>]*>/, replacement: `<meta property="og:image" content="${absImage}" />` },
    { selector: /<meta name="twitter:image"[^>]*>/, replacement: `<meta name="twitter:image" content="${absImage}" />` },
  ]
  for (const r of replacements) {
    if (r.selector.test(out)) out = out.replace(r.selector, r.replacement)
    else out = out.replace(/<\/head>/, `    ${r.replacement}\n  </head>`)
  }
  // og:url + canonical are not in the source HTML, always inject.
  out = out.replace(
    /<\/head>/,
    `    <meta property="og:url" content="${absUrl}" />\n    <link rel="canonical" href="${absUrl}" />\n  </head>`,
  )
  return out
}

function main() {
  if (!existsSync(DIST)) {
    console.error('[prerender-meta] dist/ not found. Run vite build first.')
    process.exit(1)
  }
  const baseHtml = readFileSync(join(DIST, 'index.html'), 'utf8')

  for (const route of ROUTES) {
    const html = rewriteHead(baseHtml, route)
    const outPath = join(DIST, route.out)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, html, 'utf8')
    console.log(`  - ${route.path.padEnd(20)} -> dist/${route.out}`)
  }
  console.log(`\n[prerender-meta] Wrote ${ROUTES.length} HTML files with route-specific meta tags.`)
  console.log(`[prerender-meta] SITE_ORIGIN = ${SITE_ORIGIN}`)
}

main()
