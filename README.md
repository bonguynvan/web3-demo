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
| **Whale flow** | 60s notional ≥ $100k with ≥60% directional skew | Active market live |
| **Confluence** | ≥2 distinct sources align on direction | Synthesizer over above |

All thresholds are tunable in one file — `src/signals/compute.ts`.

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

The Bots tab shows a live portfolio summary — total P&L, win rate, top/worst
bot, equity-curve sparkline, plus per-bot cards with the last 5 fills.

State persists in `localStorage` key `tc-bots-v1`. Server-backed bots come
in Phase B2.

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
- ✅ Phase S1 — five signal sources + confluence
- ✅ Phase S1.7 — browser + in-app alerts
- ✅ Phase B1 — paper-trading bot framework
- ⏳ Phase 2d — wallet-signed live trading via Hyperliquid (testnet validation pending)
- 🔜 Phase B2 — server-backed bots ("set it and forget it" mode)
- 🔜 Phase 2e — Binance authenticated trading via server-side key proxy

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
