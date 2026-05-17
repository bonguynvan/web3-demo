# TradingDek

**Research and bots, execute where you already trade.**

Live signal scanner, paper-trading bots with backtest replay, public hit-rate
track record, and a strategy marketplace — all in your browser. Deep-links to
Binance and Hyperliquid for execution so you keep your liquidity, your risk
tools, and your funds.

![React 19](https://img.shields.io/badge/React_19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-blue)
![Vite 8](https://img.shields.io/badge/Vite_8-purple)
![Tailwind v4](https://img.shields.io/badge/Tailwind_v4-cyan)

---

## What it is

TradingDek is a **research deck**, not an exchange. We don't try to out-Binance
Binance — their order entry is better than anything we could build. Instead:

- **Multi-venue terminal** — chart, orderbook, ticker streams across Binance
  and Hyperliquid, switch with one click
- **Eight signal sources + confluence** — funding extremes, EMA crossovers,
  RSI, volatility spikes, liquidation cascades, whale flow, news, on-chain
  whale wallets; a confluence layer fires when ≥2 sources agree on direction
- **Public hit-rate track record (`/proof`)** — every signal is timestamped at
  trigger, resolved 30 minutes later against the live mark. Falsifiable per
  source, sample sizes shown. The same client-side ledger drives both the
  workstation panel and the standalone public page
- **Paper-trading bots with backtest replay (`/replay`)** — auto-execute on
  matching signals; replay any bot against historical candles bar-by-bar
- **Risk caps** — daily loss / max drawdown / max exposure with engine
  pre-check, so trades that would breach the cap never open
- **Strategy marketplace (`/library`)** — curated + community bots, install
  in one click; follow authors; per-author profile pages
- **Deep-link execution** — "Trade on Binance →" or "Trade on Hyperliquid →"
  from every signal card; bots can route real signed orders if you connect a
  Binance API key (encrypted in your browser via AES-GCM + PBKDF2)

The free tier does everything except live execution, and live mode is
BYO-API-key (your funds, your venue, our research).

---

## Quick start

```bash
nvm use 20.19    # or 22+
pnpm install
pnpm dev         # http://localhost:5173
```

Open `/` for the landing page or `/trade` for the workstation.

No backend, no API keys, no env vars required for the first run — Binance and Hyperliquid public endpoints are enough.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Vite + React 19)                                      │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│  │  Chart  │ │  Depth  │ │  Trade  │ │ Signals │ │  Bots   │    │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘    │
│       │           │           │           │           │          │
│  ┌────┴───────────┴───────────┴───────────┴───────────┴───────┐ │
│  │  Hooks: usePrices, useMarketWs, useSignals, useBotEngine   │ │
│  └─────────────────────┬───────────────────────────────────────┘ │
│                        ↓                                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Venue Adapter Registry                                     │ │
│  │  ┌───────────────────┐  ┌─────────────────────────────────┐ │ │
│  │  │ BinanceAdapter    │  │ HyperliquidAdapter              │ │ │
│  │  │ /api/v3/* + ws    │  │ /info + ws (wallet signed soon) │ │ │
│  │  └───────────────────┘  └─────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Adding a new venue is one file: implement the `VenueAdapter` interface in
`src/adapters/<venue>/<Venue>Adapter.ts` and register it in
`src/adapters/registry.ts`. The UI rebinds automatically.

### Key directories

```
src/
├── adapters/        Venue adapter layer (Binance, Hyperliquid)
├── signals/         Signal compute (funding, crossover, RSI, volatility, whale, confluence)
├── bots/            Bot framework + backtest engine + portable JSON
├── components/      React UI (TradingChart, SignalsPanel, BotsPanel, ErrorBoundary, ...)
├── hooks/           useSignals, useBotEngine, useRiskMonitor, useDocumentMeta, ...
├── pages/           LandingPage, TradePage, ProofPage, BacktestReplayPage,
│                    StrategyLibraryPage, AuthorProfilePage, LegalPage, ...
├── store/           Zustand stores (bots, watchlist, follow, risk, device-id, ...)
├── strategies/      Curated + seeded community strategies (PortableBot v:1)
└── lib/             Shared helpers (errorReporter, documentMeta, venueLinks,
                     credentialsVault, signalChartMarkers, ...)

public/
├── favicon.svg      Brand mark
├── robots.txt       SEO crawler policy
├── sitemap.xml      Indexable routes
├── og.png           Default OG card (1200×630)
├── proof-og.png     Dedicated OG card for /proof shares
├── hero-bg.png      Atmospheric hero background
└── *-empty.png      Empty-state illustrations (library, portfolio, signals)

scripts/
├── generate-assets.mjs    Regenerate brand assets via fal.ai Flux Pro
└── check-bundle-size.mjs  Post-build budget enforcement (CI + local)

docs/
├── BOTS.md                   Bot framework reference — risk profiles, SL/TP/BE/trail, multi-TPs, shadows, fork lineage, walk-forward, AI features
├── DEPLOYMENT.md             Step-by-step deploy guide (Vercel, Netlify, CF Pages)
├── DEPLOYMENT_COOLIFY.md     Point-and-click Coolify-on-Hetzner deploy (recommended)
├── DEPLOYMENT_BACKEND.md     Bare `docker compose` + Caddy path
└── PUBLISHING_STRATEGIES.md  How to contribute a strategy to the curated library
```

> **Deploying for the first time?** Read `docs/DEPLOYMENT_COOLIFY.md` —
> it walks you through a complete one-domain, one-VPS, two-container
> deploy via the Coolify web UI with no terminal beyond a single
> installer command.

### Scripts

| Command | What |
|---|---|
| `pnpm dev` | Vite dev server on http://localhost:5173 |
| `pnpm build` | TypeScript check + Vite production build (requires Node ≥20.19) |
| `pnpm size` | Check `dist/` against bundle-size budgets |
| `pnpm gen:assets` | Regenerate `public/*.png` via fal.ai (requires `FAL_KEY` env) |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | E2E tests (Playwright) |

---

## Signal sources

| Source | Trigger | Coverage |
|---|---|---|
| **Funding** | Funding rate ≥ ±0.01%/hr | Every perp market |
| **Crossover** | EMA9 crosses EMA21 on a closed bar | Top 10 markets by 24h volume |
| **RSI** | Wilder(14) crosses 30 / 70 | Top 10 markets |
| **Volatility** | Bar range ≥ 3× rolling 20-bar avg | Top 10 markets |
| **Whale flow** | 60s notional ≥ $100k with ≥60% directional skew | Top 10 markets |
| **Liquidation** | 5+ aggressive same-side fills + $200k notional in 30s | Top 10 markets |
| **News** | CryptoPanic important headline | When `VITE_CRYPTOPANIC_TOKEN` set |
| **Whale wallet** | Hyperliquid `userFills` open ≥ $50k | When `VITE_HL_WHALE_WALLETS` set |
| **Confluence** | ≥2 distinct sources align on direction | Synthesizer over the above |

Thresholds are user-tunable in the SignalSourcesModal (sliders for RSI bands,
volatility multiple, whale skew). Per-source on/off toggles, min-confidence
filter, sound alert, source solo, signal dismiss, and signal pinning all
persist in `localStorage`.

### Hit-rate tracking

Every fired signal is recorded at trigger price and resolved 30 minutes later
against actual price movement. The modal exposes:

- Per-source win rate + sample count
- Direction skew (longs vs shorts in the current regime)
- Best/worst markets leaderboard
- Recent outcomes (last 5 hit/miss with price move %)
- "Last fired Xm ago" indicator per source
- CSV export of the resolved buffer
- Clear-with-confirm to reset stats after a strategy change

---

## Bot framework

Bots are defined by a `BotConfig`:

```ts
{
  name: 'Confluence Sniper',
  enabled: true,
  mode: 'paper',                     // 'live' gated on Phase 2d signing
  allowedSources: ['confluence'],
  allowedMarkets: [],                // empty = any
  minConfidence: 0.7,
  positionSizeUsd: 100,
  holdMinutes: 60,
  maxTradesPerDay: 10,
}
```

The engine watches the live signal feed, opens virtual positions on matches,
holds for `holdMinutes` (or exits early on opposing confluence with ≥0.7
confidence), and books realized P&L at the current mark.

The Bots tab shows a sticky portfolio summary (total P&L, realized vs
unrealized, equity-curve sparkline, top/worst bot) and risk metrics
(max drawdown, profit factor, worst losing streak).

Per-bot cards include:
- Inline rename (double-click name) and persisted sort selector
- Pause-all / resume-all kill switch
- 4-stat grid (total · win rate · total P&L · open unrealized)
- Per-bot equity sparkline + directional left-edge stripe (long/short bias)
- Today's trade count vs daily cap (warns when capped via toast)
- Collapsible recent fills with click-to-expand details (source, hold,
  size, mark, % move, opened time)
- Click trade row to focus that market on the chart
- Background tint by PnL magnitude
- Per-bot share (export portable JSON), backtest, and delete actions
- CSV export of the full trade ledger

State persists in `localStorage` key `tc-bots-v1`. Server-backed bots come
in Phase B2.

### Strategy library

`/library` hosts curated bot configs with author, summary, tags, and
optional tracked-since performance numbers. One-click "Add to my bots"
calls the same `addBot()` action the import flow uses. Foundation for
the upcoming social marketplace surface.

### Power-user shortcuts

- **Cmd/Ctrl+K** — venue-agnostic market quick-jump palette with fuzzy
  search and arrow-key navigation
- **Cmd/Ctrl+L** — open the live-order modal pre-filled with the active
  market (vault must be unlocked)
- **?** — keyboard shortcut reference
- **Settings → Backup** — export/import all user state (bots, signal
  settings, thresholds, performance history) as a single JSON for
  cross-browser migration

## Live trading

Authenticated venue trading is wired end-to-end for Binance:

- **Encrypted credentials vault** — API keys are stored client-side only,
  encrypted with a user passphrase via AES-GCM + PBKDF2-SHA256 (600k iterations).
  No server custody. Vault auto-pushes creds into adapters on unlock.
- **Live balances + equity** — `Portfolio` shows real balances, USD-priced
  crypto holdings, "live equity" hero, and per-venue trading-scope badges.
- **Live open orders + cancel** — view open orders signed-fetched via
  `/api/v3/openOrders`; cancel any with one click.
- **Live fills history + toasts** — `/api/v3/myTrades` per active market;
  new fills toast in real time so you know when a bot order filled.
- **Place limit order** — `PlaceOrderModal` with market dropdown, price
  pre-fill from ticker, % of cash quick-size buttons, notional warning
  if > 50% of free USDT, confirm step. Limit-only by design.
- **Bot live mode** — flip a paper bot to `live` from its mode badge.
  Confirm dialog shows max daily exposure ($pos × cap). Engine routes
  trades through `adapter.placeOrder` with hard guardrails (vault
  unlocked, key authed, trading scope). Cancel-live-trade button on
  each open trade. Engine cancels unfilled orders at hold expiry.
- **Activity feed** — chronological view of paper trades + venue fills +
  resolved signals on Portfolio.
- **Status banners** — amber "Vault locked" CTA and green "Live trading
  active" indicator across the app.
- **Hyperliquid wallet** — connect via wagmi (EIP-712 signing). Public
  data flows (balances, open orders, account snapshot) work; order
  placement is intentionally stubbed pending testnet validation of the
  msgpack signing recipe (the existing JSDoc in `HyperliquidAdapter.placeOrder`
  documents the exact path).
- **Reduce-only** flag in the place-order modal for perp venues — close
  positions without accidentally opening new ones.
- **Emergency stop** button on `/profile` — disables every bot and
  cancels every open live order across all connected venues in one
  click. The kill switch.

---

## Deployment

Static SPA — any host works. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
for step-by-step:

- Vercel (recommended), Netlify, Cloudflare Pages
- SPA fallback configuration
- Optional environment variables (waitlist endpoint, Hyperliquid network)
- Security headers + CSP for the venue endpoints
- Brand-asset workflow for `og.png`

---

## Roadmap

- ✅ Phase 1 — multi-venue read-only terminal
- ✅ Phase S1 — eight signal sources + confluence
- ✅ Phase S1.7 — browser + in-app alerts + Telegram + sound
- ✅ Phase S2 — hit-rate tracking, market leaderboard, CSV export
- ✅ Phase B1 — paper-trading bot framework with risk metrics
- ✅ Phase M1 — strategy library (curated marketplace MVP)
- ✅ Phase 2e — Binance authenticated trading (place / cancel / view via signed REST)
- ✅ Phase B3 — bot live mode with hard guardrails
- ⏳ Phase 2d — wallet-signed live trading via Hyperliquid (testnet validation pending)
- 🔜 Phase B2 — server-backed bots ("set it and forget it" mode)
- 🔜 Phase 2e — CEX authenticated trading via server-side key proxy
- 🔜 Phase M2 — strategy marketplace backend (publish, follow, comment,
  performance tracking)
- 🔜 Phase V1 — additional venue adapters (system designed for both CEX
  and DEX — new venues plug in via the `VenueAdapter` interface)

---

## Stack

| Layer | Tool | Why |
|---|---|---|
| Build | Vite 8 | Fast HMR, small builds, native ESM |
| UI | React 19 + Tailwind v4 | Modern, lean, expressive |
| Charts | `@tradecanvas/chart` | Indicator + drawing-tool engine |
| State | Zustand | Selector subscriptions, no re-render cascades |
| Wallet | wagmi v3 + viem | Type-safe wallet integration (used for identity + future signing) |
| Tests | Vitest + Playwright | Unit + E2E |

---

## License

MIT
