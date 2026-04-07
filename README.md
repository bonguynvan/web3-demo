# Perp DEX — Perpetual Futures Trading Platform

A full-stack decentralized perpetual futures exchange built on the GMX v1 AMM architecture. Traders trade against a USDC liquidity pool at Chainlink oracle prices with up to 20x leverage.

![Stack](https://img.shields.io/badge/React_19-blue) ![Stack](https://img.shields.io/badge/TypeScript-blue) ![Stack](https://img.shields.io/badge/Solidity_0.8.24-gray) ![Stack](https://img.shields.io/badge/Foundry-red) ![Stack](https://img.shields.io/badge/Vite_8-purple) ![Stack](https://img.shields.io/badge/Tailwind_v4-cyan) ![Stack](https://img.shields.io/badge/wagmi_viem-orange)

## Quick Start

```bash
npm install
npm run dev:full    # Starts everything: Anvil → Deploy → Keepers → Vite
```

Or run just the frontend (demo mode, no backend needed):

```bash
npm run dev         # http://localhost:5173 — demo mode works out of the box
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐          │
│  │  Chart   │ │  Depth   │ │  Order   │ │ Positions │          │
│  │(chart-lib)│ │  Book    │ │  Form    │ │  Table    │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘          │
│       │             │            │              │                │
│  ┌────┴─────────────┴────────────┴──────────────┴────────────┐  │
│  │  Hooks: usePrices, usePositions, useTradeExecution, ...   │  │
│  │  Mode: Demo (simulated) ←→ Live (on-chain via wagmi)      │  │
│  └───────────────────────────────────────────────────────────┘  │
│       │ Demo mode          │ Live mode                          │
│  ┌────┴──────┐        ┌────┴──────────────────────────────┐    │
│  │ demoData  │        │ wagmi/viem → Anvil/Testnet RPC    │    │
│  │ TickEngine│        │ Router, PositionManager, PriceFeed │    │
│  └───────────┘        └───────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Smart Contracts (Foundry, Solidity 0.8.24)                      │
│  Vault ← PositionManager → Router ← PriceFeed (Chainlink)       │
│  120 tests passing, Slither audited, security hardened           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Keepers (Node.js + viem)                                        │
│  - Liquidation bot: scans positions, liquidates underwater ones  │
│  - Price updater: simulates oracle price movement for local dev  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Demo / Live Mode

The app has a **[Demo] / [Live]** toggle in the header:

| Feature | Demo Mode | Live Mode |
|---------|-----------|-----------|
| Prices | Simulated (tick every 500ms) | Chainlink oracle via PriceFeed contract |
| Balance | $100,000 demo USDC | Real on-chain USDC balance |
| Trading | Instant simulation with fees | Router.increasePosition contract call |
| Positions | In-memory demo store | PositionManager.getPosition on-chain |
| Wallet | Not required | MetaMask or Demo Account connector |

Demo mode works with zero setup — no Anvil, no wallet, no backend.

---

## Frontend Features

### Trading Interface
- **Full chart** with 23 technical indicators, 23 drawing tools (TradingView-style left sidebar), 7 timeframes, 7 chart types
- **Chart settings** dialog (candle colors, grid, volume, crosshair mode, log scale)
- **Synthetic depth book** with 15 ask/bid levels, spread display, click-to-fill
- **Trade tape** with streaming trades, whale highlighting, flash animation
- **Price flash** (FlashPrice component) — green ▲ / red ▼ on tick

### Order Entry
- Long/Short with market/limit order types
- Leverage slider (1-20x) with presets
- **TP/SL** (Take Profit / Stop Loss) with PnL preview
- **Reduce-only** toggle
- Collateral % buttons (10/25/50/75/100% of balance)
- Full fee breakdown: open fee, spread, net collateral, effective entry, liquidation price

### Fee Model
| Fee | Rate | Description |
|-----|------|-------------|
| Open fee | 0.1% | Deducted from collateral on entry |
| Close fee | 0.1% | Deducted from payout on exit |
| Spread | 0.05% | Applied to entry price (longs pay higher) |
| Funding | ~0.01%/8h | Continuously accrued on open positions |
| Liquidation | $5 flat | Charged on forced liquidation |

### Position Management
- Live PnL with flash animation
- **Partial close** with % slider (25/50/75/100%)
- Close fee and realized PnL shown on close
- TP/SL orders appear in Orders tab
- Trade history with P&L summary (total, fees, net)

### Account
- **Account equity bar**: equity, available, margin used, unrealized PnL, daily P&L, health bar
- **Demo accounts**: 4 pre-funded Anvil accounts, no MetaMask needed
- **Faucet**: mint $10K test USDC on Anvil
- **Toast notifications**: trade confirmations, errors, warnings

### Performance
- **TickEngine**: zero-allocation ring buffer (Float64Array) for 1000+ ticks/sec
- rAF-throttled chart updates (60fps max), store updates (15fps for React)
- Dirty-layer rendering in chart (only redraws changed layers)
- Selector-based Zustand subscriptions (no unnecessary re-renders)

---

## Smart Contracts

GMX v1-style AMM perpetual futures protocol:

| Contract | Purpose |
|----------|---------|
| **Vault** | USDC liquidity pool, LP deposit/withdraw, PLP token |
| **PositionManager** | Open/close/liquidate leveraged positions |
| **Router** | User entry point with slippage protection |
| **PriceFeed** | Chainlink oracle wrapper with staleness/deviation/sequencer checks |
| **PLP** | LP share token (ERC20) |
| **Libraries** | PriceMath (decimal conversion), PositionMath (PnL/liquidation), Constants |

### Security
- 120 unit + fuzz tests passing
- Slither static analysis (20 findings, all mitigated)
- Manual security audit: CRIT-4 fixes (minter front-run, Router PLP transfer, oracle phase boundary)
- Zero-address guards, max fee/spread caps, admin events

```bash
cd packages/contracts
forge test           # run all tests
forge test --gas     # with gas reporting
```

---

## Project Structure

```
├── src/                        # React frontend
│   ├── components/             # UI components
│   │   ├── TradingChart.tsx    # Full chart with indicators + drawings
│   │   ├── ChartToolbar.tsx    # Top toolbar (timeframes, chart type, indicators)
│   │   ├── DrawToolsSidebar.tsx# Left sidebar drawing tools (TradingView style)
│   │   ├── ChartSettings.tsx   # Settings dialog (colors, display, scale)
│   │   ├── DepthBook.tsx       # Synthetic AMM depth visualization
│   │   ├── Web3OrderForm.tsx   # Order entry with TP/SL and fees
│   │   ├── PositionsTable.tsx  # Positions + Orders + History tabs
│   │   ├── RecentTrades.tsx    # Streaming trade tape
│   │   ├── Web3Header.tsx      # Market stats, funding rate, wallet
│   │   ├── AccountBar.tsx      # Equity, margin, PnL summary
│   │   ├── ToastContainer.tsx  # Notification system
│   │   └── ui/                 # Reusable: FlashPrice, Dropdown
│   ├── hooks/                  # Data hooks (demo + live paths)
│   │   ├── usePrices.ts        # Oracle prices (demo: simulated, live: PriceFeed)
│   │   ├── usePositions.ts     # Open positions (demo: store, live: on-chain)
│   │   ├── useTradeExecution.ts# Approve → trade flow
│   │   ├── useMarketStats.ts   # 24h stats, funding rate countdown
│   │   ├── useTradeFeed.ts     # Streaming fake trade generator
│   │   ├── useTickEngine.ts    # High-perf tick → chart bridge
│   │   └── ...
│   ├── lib/                    # Core libraries
│   │   ├── tickEngine.ts       # Zero-alloc tick ingestion (Float64Array ring)
│   │   ├── demoData.ts         # Demo mode state (positions, orders, history)
│   │   ├── demoConnector.ts    # wagmi connector for Anvil demo accounts
│   │   ├── contracts.ts        # ABI + address config
│   │   ├── precision.ts        # 6/18/30 decimal converters
│   │   └── ...
│   └── store/                  # Zustand stores
│       ├── tradingStore.ts     # UI state (market, timeframe, candles, form)
│       ├── modeStore.ts        # Demo/Live mode switch
│       └── toastStore.ts       # Notification state
├── packages/
│   ├── contracts/              # Foundry smart contracts
│   ├── keepers/                # Liquidation bot + price updater
│   ├── server/                 # Backend (Hono + SQLite + WebSocket)
│   ├── commons/                # Chart library: types, constants, utils
│   ├── core/                   # Chart library: renderers, indicators, drawings
│   └── library/                # Chart library: Chart class, public API
└── scripts/
    ├── dev.mjs                 # Full stack launcher (Anvil → deploy → all services)
    └── export-addresses.mjs    # Extract deployed addresses from forge broadcast
```

---

## Dev Stack (`npm run dev:full`)

Starts 5 services with one command:

| Service | Port | Purpose |
|---------|------|---------|
| Anvil | :8545 | Local EVM chain |
| Contracts | — | Auto-deploy on startup |
| Price Updater | — | GBM oracle simulation |
| Liquidator | — | Underwater position scanner |
| Vite | :5173 | Frontend with HMR |

Press `Ctrl+C` to stop everything.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 19, TypeScript, Vite 8 | Component model, type safety, instant HMR |
| Styling | Tailwind CSS v4 | Custom theme tokens, utility-first |
| State | Zustand | Selector subscriptions, no re-render cascade |
| Web3 | wagmi v3, viem | Type-safe contract interactions |
| Charts | Custom chart-lib (canvas) | 23 indicators, 23 drawing tools, streaming |
| Contracts | Solidity 0.8.24, Foundry | GMX v1 AMM, 120 tests, fuzz testing |
| Keepers | Node.js, viem | Liquidation bot, oracle simulator |
| Backend | Hono, SQLite, WebSocket | Event indexer, REST API, price feed |

---

## License

MIT
