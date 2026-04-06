# Frontend Architecture — Perp DEX

A GMX-style perpetual futures DEX frontend built with React, wagmi, and Zustand.
This document explains the architecture, Web3 integration patterns, and how everything connects.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Tech Stack](#tech-stack)
3. [Directory Structure](#directory-structure)
4. [Layout & Components](#layout--components)
5. [State Management](#state-management)
6. [Web3 Integration — How dApps Talk to Blockchains](#web3-integration)
7. [The Trade Lifecycle — From Click to On-Chain](#the-trade-lifecycle)
8. [Chart System](#chart-system)
9. [Price Simulator & Stress Testing](#price-simulator--stress-testing)
10. [Key Web3 Concepts Explained](#key-web3-concepts-explained)
11. [Performance Patterns](#performance-patterns)

---

## High-Level Overview

```
┌──────────────────────────────────────────────────────────┐
│                      Browser                              │
│                                                          │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Chart   │  │ Order    │  │ Market   │  │ Positions│ │
│  │ (canvas) │  │ Form     │  │ Info     │  │ Table    │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │              │              │              │      │
│  ┌────┴──────────────┴──────────────┴──────────────┴───┐ │
│  │              Zustand Stores                          │ │
│  │   tradingStore (candles, orders, markets)             │ │
│  │   sessionStore (wallet, auth session)                 │ │
│  └────────────────────┬─────────────────────────────────┘ │
│                       │                                    │
│  ┌────────────────────┴─────────────────────────────────┐ │
│  │              React Hooks Layer                        │ │
│  │  usePrices · usePositions · useTradeExecution         │ │
│  │  useVault  · useTokenBalance · useFaucet              │ │
│  └────────────────────┬─────────────────────────────────┘ │
│                       │                                    │
│  ┌────────────────────┴─────────────────────────────────┐ │
│  │         wagmi + viem + React Query                    │ │
│  │   useReadContract · useWriteContract · useAccount     │ │
│  └────────────────────┬─────────────────────────────────┘ │
│                       │ JSON-RPC                           │
└───────────────────────┼────────────────────────────────────┘
                        │
              ┌─────────┴─────────┐
              │  Ethereum Node     │
              │  (Anvil / Arbitrum)│
              │                   │
              │  Smart Contracts: │
              │  · Vault          │
              │  · Router         │
              │  · PositionMgr    │
              │  · PriceFeed      │
              │  · USDC (ERC-20)  │
              └───────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | React 19 | Component model, hooks, ecosystem |
| **Build** | Vite 8 | Fast HMR, ES modules, Tailwind integration |
| **Styling** | Tailwind CSS v4 | Utility-first, no CSS files to manage |
| **State** | Zustand | Minimal API, no boilerplate, supports subscriptions outside React |
| **Web3** | wagmi 3 + viem 2 | Type-safe Ethereum interactions, wallet management |
| **RPC Cache** | TanStack React Query | Deduplicates RPC calls, automatic refetching |
| **Chart** | Custom canvas library (@chart-lib) | 60fps rendering, indicators, drawing tools |
| **Icons** | lucide-react | Lightweight, tree-shakeable SVG icons |
| **Types** | TypeScript 5.9 (strict) | End-to-end type safety including contract ABIs |

---

## Directory Structure

```
src/
├── main.tsx                  # App entry — wraps in Web3Provider + StrictMode
├── App.tsx                   # Main layout — routes data to panels
├── index.css                 # Tailwind config + custom theme (dark trading UI)
│
├── components/               # UI components (no business logic)
│   ├── ui/
│   │   └── Dropdown.tsx      # Shared dropdown with click-outside + Escape
│   ├── Web3Provider.tsx      # wagmi + React Query context
│   ├── Web3Header.tsx        # Market selector, wallet, vault stats
│   ├── TradingChart.tsx      # Canvas chart with loading overlay
│   ├── ChartToolbar.tsx      # Timeframe, chart type, indicators, drawing tools
│   ├── Web3OrderForm.tsx     # Long/Short, leverage, submit trade
│   ├── MarketInfo.tsx        # Oracle prices, pool stats, parameters
│   ├── PositionsTable.tsx    # Open positions with PnL, close button
│   ├── RecentTrades.tsx      # Trade tape (throttled to 60fps)
│   ├── ErrorBoundary.tsx     # Per-panel crash isolation
│   └── DevOverlay.tsx        # Simulator controls + FPS counter
│
├── hooks/                    # Business logic (read/write blockchain)
│   ├── usePrices.ts          # Poll oracle prices every 3s
│   ├── usePositions.ts       # Read open positions, compute PnL
│   ├── useTradeExecution.ts  # Full trade flow: approve → submit → confirm
│   ├── useTokenBalance.ts    # Read USDC balance for connected wallet
│   ├── useVault.ts           # Vault pool stats (TVL, utilization)
│   ├── useVaultOperations.ts # Deposit/withdraw liquidity
│   ├── useFaucet.ts          # Mint test USDC on Anvil
│   ├── useMarketWs.ts        # Build candles from oracle prices (or simulation)
│   └── useSimulator.ts       # High-frequency price simulator for stress testing
│
├── store/                    # Zustand stores
│   ├── tradingStore.ts       # UI state: markets, candles, order form
│   └── sessionStore.ts       # Wallet & auth session (Sign-to-Trade)
│
├── lib/                      # Pure utilities (no React)
│   ├── web3Config.ts         # wagmi chain + transport config
│   ├── contracts.ts          # Contract addresses + ABI bindings
│   ├── eip712.ts             # Sign-to-Trade authentication (EIP-712)
│   ├── precision.ts          # Decimal conversions (6-dec ↔ 30-dec ↔ 18-dec)
│   ├── format.ts             # formatUsd, formatCompact, cn()
│   ├── chartConfig.ts        # Chart theme, timeframes, drawing tools
│   ├── priceSimulator.ts     # PriceSimulator class (GBM random walk)
│   ├── waitForReceipt.ts     # Transaction receipt helper via wagmi
│   ├── useThrottledValue.ts  # rAF-based render throttle
│   └── fixedPoint.ts         # Fixed-point math library
│
├── types/
│   └── trading.ts            # Shared types: Market, Position, Trade, CandleData
│
└── assets/                   # Static images
```

---

## Layout & Components

The layout is a GMX-style trading dashboard — everything on one screen:

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo]  [ETH-PERP ▼]  Oracle: $3,450  Pool: $1.2M  │ [Wallet] │
├───────────────────────────────────────┬──────────┬───────────┤
│                                       │ Market   │           │
│           Trading Chart               │  Info    │  Order    │
│         (canvas, 60fps)               │          │  Form     │
│                                       ├──────────┤           │
│                                       │ Recent   │ [Long]    │
│                                       │ Trades   │ [Short]   │
├───────────────────────────────────────┴──────────┤           │
│  [Positions] [Orders] [History]                   │ [Submit]  │
│  ETH-PERP  LONG 10x  $5,000  +$234.56 (+4.7%)   │           │
└──────────────────────────────────────────────────┴───────────┘
```

**Responsive**: Below `xl` (1280px), panels stack vertically.

**Error isolation**: Each panel is wrapped in its own `ErrorBoundary`. If the chart crashes, you can still close positions. This is critical for a trading UI.

---

## State Management

### Why Two Stores?

```
tradingStore (high frequency)          sessionStore (low frequency)
──────────────────────────             ─────────────────────────
· candles[] — updates 100x/sec        · address — changes on connect
· recentTrades[] — updates often       · session — changes on sign
· orderForm fields                     · status — disconnected/ready
· selectedMarket                       · chainId
```

If these were one store, every candle tick would re-render the wallet button.
Zustand's selector pattern (`useTradingStore(s => s.candles)`) ensures components
only re-render when their specific slice changes.

### On-Chain Data Lives in Hooks, Not Stores

Positions, balances, and prices come from wagmi hooks (`useReadContract`),
which are backed by React Query. This gives us:
- Automatic refetching on an interval
- Deduplication (10 components reading the same contract = 1 RPC call)
- Cache invalidation after writes

---

## Web3 Integration

### How a dApp Talks to a Blockchain

```
Your React App
     │
     │  useReadContract({ functionName: 'getPoolAmount' })
     ▼
   wagmi  ←── manages wallet connection, chain switching
     │
     │  eth_call (read) or eth_sendTransaction (write)
     ▼
   viem   ←── low-level: ABI encoding, transaction formatting
     │
     │  JSON-RPC over HTTP
     ▼
  Ethereum Node (Anvil locally, or Alchemy/Infura in production)
     │
     │  Executes EVM bytecode
     ▼
  Smart Contract (Vault.sol, Router.sol, etc.)
```

### Wallet Connection (wagmi)

```tsx
// lib/web3Config.ts — configure which chains and wallets
const config = createConfig({
  chains: [foundry],                    // Anvil for dev, Arbitrum for prod
  connectors: [injected()],             // MetaMask, Rabby, etc.
  transports: { [foundry.id]: http() }, // HTTP JSON-RPC transport
})

// In components — wagmi hooks manage everything
const { address, isConnected } = useAccount()     // current wallet
const { connect, connectors } = useConnect()       // show wallet picker
const { disconnect } = useDisconnect()             // disconnect
```

### Reading Contract Data

```tsx
// hooks/usePrices.ts — poll oracle prices every 3 seconds
const { data } = useReadContracts({
  contracts: markets.map(m => ({
    address: priceFeed,
    abi: priceFeedAbi,
    functionName: 'getLatestPrice',
    args: [m.indexToken],
  })),
  query: { refetchInterval: 3_000 },  // auto-refresh
})
```

This is a **read** — it doesn't cost gas, doesn't need a wallet signature.
It's like calling a REST API, except the "server" is a blockchain node.

### Writing to Contracts (Transactions)

```tsx
// hooks/useTradeExecution.ts — open a leveraged position
const hash = await writeContractAsync({
  address: router,
  abi: routerAbi,
  functionName: 'increasePosition',
  args: [indexToken, collateral, sizeUsd, isLong, acceptablePrice],
})
// This triggers MetaMask popup → user confirms → tx sent to chain
// Then wait for the tx to be mined:
await waitForTransactionReceipt(config, { hash })
```

Writes **cost gas** (paid in ETH) and **change blockchain state**.

---

## The Trade Lifecycle

Here's what happens when a user clicks "Long ETH":

```
1. USER CLICKS "Long ETH"
   │
2. CHECK USDC ALLOWANCE
   │  useReadContract → Router allowed to spend my USDC?
   │
   ├─ NO → APPROVE USDC
   │        writeContractAsync → ERC-20 approve(router, MAX_UINT256)
   │        MetaMask popup: "Allow Perp DEX to spend your USDC"
   │        Wait for tx confirmation...
   │
3. SUBMIT TRADE
   │  writeContractAsync → Router.increasePosition(...)
   │  MetaMask popup: "Confirm transaction — estimated gas: 0.002 ETH"
   │  
4. WAIT FOR CONFIRMATION
   │  waitForTransactionReceipt(hash)
   │  Anvil: instant. Arbitrum: ~2 seconds.
   │
5. UPDATE UI
   │  Invalidate React Query cache
   │  Positions table refetches → shows new position
   │  Balance updates → USDC decreased by collateral amount
   │
6. SHOW SUCCESS
   └  "Trade confirmed!" + clear order form
```

The state machine in `useTradeExecution`:
```
idle → approving → submitting → confirming → success
                                           → error
```

---

## Chart System

### Architecture

The chart is a custom **canvas-based** rendering library (`@chart-lib`):

```
packages/
├── commons/    # Shared types (OHLCBar, Theme, ViewportState)
├── core/       # Rendering engine, canvas layers, interaction handlers
└── library/    # Public API (Chart class)
```

### How Data Flows to the Chart

```
Oracle/Simulator → usePrices hook → useMarketWs hook → tradingStore → TradingChart
                                         │
                                   Builds OHLC candles
                                   from price ticks

tradingStore.subscribe() ──→ chart.setData(bars)      # initial load
                         ──→ chart.appendBar(bar)      # new candle
                         ──→ chart.updateLastBar(bar)   # tick update (cheap)
```

### Canvas Layer System

```
z-index 3: UI Layer      — price axis, time axis, legend, current price line
z-index 2: Overlay Layer  — crosshair, drawings, trading orders
z-index 1: Main Layer     — candles, volume bars, indicators
z-index 0: Background     — grid, watermark
```

Each layer is a separate `<canvas>` element. Only dirty layers re-render.

### Key Requirement: Container Must Have Dimensions

The chart reads `container.clientWidth/clientHeight` on creation. If the container
is 0×0 (e.g., flex layout hasn't resolved), the chart creates 0×0 canvases.
We solve this with a `ResizeObserver` — chart is only created after the first
non-zero size callback.

---

## Price Simulator & Stress Testing

Toggle the **Dev Panel** (bottom-right) to enable the price simulator.

### How It Works

```
PriceSimulator (lib/priceSimulator.ts)
  │
  │  setInterval(intervalMs) — e.g., every 10ms
  │  For each pair: price *= (1 + GBM_noise)
  │  Emit batch of PriceTick[]
  │
  ▼
useSimulator hook
  │
  │  Buffer ticks in array
  │  requestAnimationFrame → flush once per frame
  │  Only process ticks for selected market
  │
  ▼
tradingStore
  │
  │  candles[] updated (1 setState per frame, not per tick)
  │  recentTrades[] updated (max 3 trades per frame)
  │
  ▼
TradingChart
  │  chart.updateLastBar() — lightweight, no indicator recalc
  │  chart.appendBar() — only on 5-second candle boundaries
```

### Stress Test Configurations

| Pairs | Interval | Total ticks/sec | Expected FPS |
|-------|----------|----------------|--------------|
| 2     | 500ms    | 4              | 60           |
| 10    | 50ms     | 200            | 60           |
| 30    | 20ms     | 1,500          | 60           |
| 50    | 10ms     | 5,000          | 55-60        |
| 100   | 10ms     | 10,000         | 45-55        |

The key optimization: **all ticks between frames are batched into one store update**.

---

## Key Web3 Concepts Explained

### ERC-20 Tokens & Approval Pattern

ERC-20 is the standard interface for fungible tokens (USDC, WETH, etc.).

Before a smart contract can spend your tokens, you must **approve** it:

```
1. You have 10,000 USDC in your wallet
2. You want the Router contract to take 1,000 USDC as collateral
3. First: USDC.approve(Router, MAX) — "Router can spend my USDC"
4. Then:  Router.increasePosition(...) — Router calls USDC.transferFrom(you, vault, 1000)
```

Why not just send USDC directly? Because the Router needs to atomically:
- Take your collateral
- Open the position
- Update the vault
All in one transaction. If any step fails, everything reverts.

### Oracle Prices

In a CEX, prices come from the orderbook. In a DEX like this (AMM model),
prices come from **oracles** — external price feeds pushed on-chain.

```
Chainlink Oracle (off-chain)
  │  Aggregates prices from Binance, Coinbase, Kraken, ...
  │  Posts the median price on-chain every heartbeat
  ▼
PriceFeed Contract (on-chain)
  │  Stores latest price per token
  │  getLatestPrice(WETH) → 3450_000000_000000_000000_000000_000000 (30 decimals)
  ▼
usePrices hook (frontend)
  │  Polls every 3 seconds
  │  Converts 30-decimal BigInt → display number
  ▼
UI shows: ETH $3,450.00
```

### Decimal Precision

Blockchains don't have floating point. Everything is integers:

| Format | Decimals | Example ($1,000.50) | Used By |
|--------|----------|---------------------|---------|
| USDC on-chain | 6 | `1000500000` | ERC-20 balances |
| Internal/GMX | 30 | `1000500000...` (30 zeros) | Vault, PositionManager |
| Display | - | `1000.50` | Frontend UI |

The `precision.ts` module handles all conversions:
```ts
dollarsToUsdc(1000.50)    // → 1000500000n (6 dec)
usdcToInternal(usdc)       // → scale up by 1e24
internalToDollars(int30)   // → back to display number
```

### EIP-712 — Typed Structured Data Signing

When MetaMask asks you to "sign a message", there are two kinds:

1. **Personal sign** (`eth_sign`) — signs raw bytes. Dangerous, phishing-prone.
2. **Typed data** (`eth_signTypedData_v4` / EIP-712) — signs structured data.
   MetaMask shows human-readable fields.

This project uses EIP-712 for Sign-to-Trade authentication:
```
MetaMask shows:
  ┌─────────────────────────────┐
  │  Sign-to-Trade              │
  │                             │
  │  Action:    Sign-to-Trade   │
  │  Timestamp: 1712345678      │
  │  Expiry:    1712432078      │
  │  Trader:    0xf39F...2266   │
  │                             │
  │  [Sign]          [Reject]   │
  └─────────────────────────────┘
```

The signature proves the wallet owner authorized a 24-hour trading session.

### Gas & Transactions

Every state-changing operation on Ethereum costs **gas**:

```
Operation                  Gas        Cost at 30 gwei
─────────────────────────  ─────────  ───────────────
ERC-20 approve             ~46,000    ~$0.05
increasePosition           ~200,000   ~$0.20
decreasePosition           ~180,000   ~$0.18
```

On Anvil (local), gas is free. On L2s (Arbitrum, Base), gas is ~$0.01-$0.10.

---

## Performance Patterns

### 1. rAF Tick Batching

```ts
// BAD: 1000 setState calls per second
ws.onmessage = (msg) => setPrice(msg.price)

// GOOD: buffer + flush once per frame
ws.onmessage = (msg) => buffer.push(msg)
requestAnimationFrame(() => {
  processAll(buffer)  // one setState
  buffer = []
})
```

### 2. Zustand Selectors

```ts
// BAD: re-renders on ANY store change
const store = useTradingStore()

// GOOD: re-renders only when candles change
const candles = useTradingStore(s => s.candles)
```

### 3. Store Subscriptions Outside React

```ts
// For the chart (imperative API), subscribe directly to the store
// instead of using React hooks — avoids the React render cycle entirely
useTradingStore.subscribe((state) => {
  chart.updateLastBar(state.candles[state.candles.length - 1])
})
```

### 4. Separate Stores for Different Update Frequencies

High-frequency data (prices, candles) and low-frequency data (wallet, auth)
live in separate Zustand stores. This prevents auth state changes from
triggering price component re-renders.

### 5. Per-Panel Error Boundaries

```tsx
<ErrorBoundary name="Chart">    {/* Chart crash won't kill order form */}
  <TradingChart />
</ErrorBoundary>
<ErrorBoundary name="OrderForm"> {/* Order form crash won't kill chart */}
  <Web3OrderForm />
</ErrorBoundary>
```

### 6. React Query for RPC Deduplication

```ts
// 5 components call usePrices() → only 1 RPC request
// React Query deduplicates by query key and caches the result
useReadContracts({
  query: { staleTime: 5000, refetchInterval: 3000 }
})
```
