# TradingDek

**Your trading deck. One screen.**

Live signal scanner and paper-trading bots across Binance and Hyperliquid.
Multi-venue chart, orderbook, signals, and execution in one workstation.

![React 19](https://img.shields.io/badge/React_19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-blue)
![Vite 8](https://img.shields.io/badge/Vite_8-purple)
![Tailwind v4](https://img.shields.io/badge/Tailwind_v4-cyan)
![wagmi/viem](https://img.shields.io/badge/wagmi_viem-orange)

---

## What it is

TradingDek combines four tools active traders pay for separately:

- **Multi-venue terminal** — chart, orderbook, ticker streams across Binance and Hyperliquid, swap with one click
- **Live signal scanner** — funding extremes, EMA crossovers, RSI, volatility spikes, whale flow, and a confluence layer that surfaces the highest-confidence trades
- **Browser + in-app alerts** — high-confidence signals ping you while you do other things
- **Paper-trading bots** — auto-execute on matching signals, full portfolio dashboard with live P&L, win rate, equity-curve sparkline

All free during the first wave. Wallet-signed live trading via Hyperliquid is the next milestone.

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
├── bots/            Bot framework types
├── components/      React UI (TradingChart, SignalsPanel, BotsPanel, ...)
├── hooks/           useSignals, useBotEngine, useTopMarketsCandles, ...
├── pages/           LandingPage, TradePage, PortfolioPage
├── store/           Zustand stores (trading, theme, mode, bots, notifications)
└── lib/             Shared helpers (formatting, binanceTicker singleton)

public/
├── favicon.svg      Brand mark
└── og-template.html Screenshot at 1200×630 → public/og.png

docs/
└── DEPLOYMENT.md    Step-by-step deploy guide (Vercel, Netlify, Cloudflare)
```

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
