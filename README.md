# Perp DEX — Decentralized Perpetual Exchange

A high-performance trading interface for a perpetual futures DEX, built with React + TypeScript. Designed for real-time data, complex UI states, and performance-sensitive rendering — matching the UX quality of platforms like dYdX, Hyperliquid, and GMX.

![Stack](https://img.shields.io/badge/React_19-blue) ![Stack](https://img.shields.io/badge/TypeScript-blue) ![Stack](https://img.shields.io/badge/Vite_8-purple) ![Stack](https://img.shields.io/badge/Tailwind_v4-cyan) ![Stack](https://img.shields.io/badge/Zustand-orange) ![Stack](https://img.shields.io/badge/TradingView_Charts-green)

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build
npm run preview    # preview production build
```

---

## Tech Stack & Why

| Technology | Purpose | Why This Choice |
|---|---|---|
| **React 19** | UI framework | Component model fits trading panels well. Concurrent features help with frequent re-renders |
| **TypeScript** | Type safety | Critical for trading data — wrong types mean wrong numbers displayed |
| **Vite 8** | Build tool | Instant HMR, fast builds. Trading UI dev requires rapid iteration |
| **Tailwind CSS v4** | Styling | Utility-first for rapid UI. Custom theme tokens for consistent trading colors |
| **Zustand** | State management | Lightweight, no boilerplate. Selector-based subscriptions prevent unnecessary re-renders |
| **lightweight-charts** | Candlestick charts | TradingView's official library. GPU-accelerated, handles 10k+ candles smoothly |
| **Lucide React** | Icons | Tree-shakeable SVG icons, consistent with professional UI |

---

## Architecture Overview

```
src/
├── components/          # UI components (each = one trading panel)
│   ├── Header.tsx       # Top bar: market selector, stats, wallet
│   ├── TradingChart.tsx # Candlestick + volume chart
│   ├── OrderBook.tsx    # Bid/ask depth ladder
│   ├── OrderForm.tsx    # Place orders (long/short, leverage)
│   ├── PositionsTable.tsx # Open positions with live PnL
│   └── RecentTrades.tsx # Trade tape
├── store/
│   └── tradingStore.ts  # Zustand store — single source of truth
├── types/
│   └── trading.ts       # TypeScript interfaces for all trading data
├── lib/
│   ├── mockData.ts      # Mock data generators (orderbook, candles, etc.)
│   ├── format.ts        # Number/time formatting utilities
│   └── useTickSimulation.ts # Simulates real-time WebSocket data
└── App.tsx              # Layout composition
```

---

## Component Breakdown

### 1. `Header.tsx` — Market Bar

**What it does:** Market selector dropdown, live market stats, wallet connection.

**Why this design:**
- Trading platforms show market context at all times — the header is the fastest place to scan key stats (mark price, 24h change, volume, funding rate) without looking away from the chart.
- The market selector is a dropdown (not a page) because traders switch markets frequently and need to stay on the same screen.
- Funding rate + countdown is shown because perp traders need to know when the next funding payment hits — it directly affects their P&L.

**Key decisions:**
```tsx
// Dropdown uses a portal-like pattern: invisible overlay catches outside clicks
{showMarketSelector && (
  <>
    <div className="fixed inset-0 z-10" onClick={() => setShowMarketSelector(false)} />
    <div className="absolute top-full ... z-20">
      {/* market list */}
    </div>
  </>
)}
```
Why not a library? A simple overlay + absolute panel is lighter than pulling in a dropdown library. For a trading app, every KB of bundle size matters.

---

### 2. `TradingChart.tsx` — Candlestick Chart

**What it does:** Full candlestick chart with volume histogram overlay, timeframe selector.

**Why lightweight-charts:**
- It's TradingView's own open-source charting library — the industry standard for financial charts.
- GPU-accelerated canvas rendering handles thousands of candles without frame drops.
- Alternatives like Chart.js or Recharts aren't designed for financial time-series data (no candlesticks, no crosshair, poor performance with streaming data).

**Key decisions:**

```tsx
// Chart is created once via useEffect, refs hold the instances
const chartRef = useRef<IChartApi | null>(null)
const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
```
Why refs instead of state? The chart is an imperative DOM object (canvas). Storing it in state would cause unnecessary re-renders. Refs give us stable references to call `.update()` and `.setData()` directly.

```tsx
// ResizeObserver for responsive sizing
const observer = new ResizeObserver(entries => {
  const { width, height } = entries[0].contentRect
  chart.applyOptions({ width, height })
})
```
Why not CSS? lightweight-charts renders to a `<canvas>` element which needs explicit pixel dimensions. ResizeObserver bridges the gap between CSS flex layout and canvas sizing.

```tsx
// Live price updates use .update() — not .setData()
seriesRef.current.update({
  time: last.time as Time,
  open: last.open,
  high: Math.max(last.high, newClose),
  low: Math.min(last.low, newClose),
  close: newClose,
})
```
Why `.update()` vs `.setData()`? `.setData()` replaces ALL candles (expensive). `.update()` only modifies the last candle — this is how real trading charts handle live ticks. The full dataset is set once, then only the tip is updated.

---

### 3. `OrderBook.tsx` — Depth Ladder

**What it does:** Shows bid (buy) and ask (sell) price levels with size and cumulative total. Depth bars visualize liquidity concentration.

**Why this design:**
- The orderbook is split into asks (top, red) and bids (bottom, green) with the current price/spread in the middle — this is the universal convention traders expect.
- Asks are reversed (`slice(0, 12).reverse()`) so the lowest ask sits closest to the spread — the most actionable price is always near the center.
- Depth bars (background width proportional to cumulative total) show where liquidity clusters. A thick bar = strong support/resistance.

**Key decisions:**

```tsx
// Depth visualization uses absolute-positioned divs, not SVG
<div
  className="absolute right-0 top-0 bottom-0 bg-long-dim"
  style={{ width: `${(entry.total / maxTotal) * 100}%` }}
/>
```
Why CSS, not canvas/SVG? The orderbook updates every tick (500ms). DOM elements with simple width transitions are cheaper to repaint than re-drawing SVG. The browser's compositor handles it efficiently.

```tsx
// Click-to-fill: clicking a price level sets the order form price
onClick={() => setOrderPrice(entry.price.toFixed(2))}
```
This is standard trading UX — see a price level you want, click it, and the order form is pre-filled. Reduces friction for limit orders.

---

### 4. `OrderForm.tsx` — Order Entry

**What it does:** Long/short toggle, market/limit order types, price input with steppers, size input with %-of-balance quick-fill, leverage slider with presets, order summary.

**Why this design:**
- **Long/Short toggle at top** — this is the highest-intent decision. Green/red coloring provides instant visual confirmation of direction.
- **Market/Limit tabs** — two most common order types for perps. Market for speed, limit for precision.
- **Leverage slider + presets** — slider for fine control (1-100x), preset buttons (1x, 2x, 5x, 10x, 20x, 50x) for common values. Most traders use a few fixed leverage levels.
- **Quick size buttons (10%, 25%, 50%, 75%, 100%)** — calculates max position size based on `balance * leverage / price`, then applies the percentage. This is how dYdX and Hyperliquid handle it.

**Key decisions:**

```tsx
// Derived values are computed inline, not stored in state
const notional = sizeNum * priceNum
const margin = notional / leverage
const fee = notional * 0.0005
```
Why not store these in Zustand? They're pure derivations of other state. Storing them would create synchronization bugs (change size but forget to update margin). Deriving them guarantees consistency.

```tsx
// Price stepper with +/- buttons
onClick={() => setOrderPrice((priceNum - 0.01).toFixed(2))}
```
Tick-by-tick price adjustment is essential for limit orders. Traders often want "one tick below the current ask" — mouse clicking is faster than typing.

---

### 5. `PositionsTable.tsx` — Open Positions

**What it does:** Tabbed panel showing open positions with live unrealized P&L, entry/mark/liquidation prices, margin, and close buttons.

**Why this design:**
- **Three tabs (Positions / Orders / History)** — standard layout. Positions are what's actively at risk, orders are what's pending, history is closed trades. Traders check positions most often, so it's the default.
- **Live PnL in both absolute ($) and percentage (%)** — dollar PnL tells you the impact, percentage tells you the efficiency. Both matter.
- **Side badge with leverage** — `LONG 10x` in a colored badge makes it instantly scannable. When you have 5+ positions, you need to differentiate fast.
- **Liquidation price shown** — this is the most critical risk metric. If mark price reaches liq price, the position is force-closed and margin is lost.

**Key decisions:**

```tsx
// PnL color is applied at the cell level, not row level
<div className={cn('font-mono font-medium', pos.unrealizedPnl >= 0 ? 'text-long' : 'text-short')}>
```
Why not color the entire row? Because other columns (entry price, size) are neutral information. Coloring only the PnL column draws the eye to what's changing — this is how Bloomberg Terminal and professional trading UIs work.

---

### 6. `RecentTrades.tsx` — Trade Tape

**What it does:** Scrolling list of recent trades (price, size, time) with color indicating buyer/seller aggression.

**Why this design:**
- The trade tape shows market activity — are people buying or selling? At what size? This gives traders a "feel" for momentum that the chart alone doesn't show.
- Green = buyer-initiated (someone bought at the ask), red = seller-initiated (someone sold at the bid).
- Limited to 30 visible trades — enough to see recent flow, not so many that scrolling becomes unwieldy.

---

## State Management — Why Zustand

### The Problem
A trading UI has **one store of truth** (current price, orderbook, positions) that **many components** consume at **high frequency** (multiple updates per second).

### Why Not Redux?
Redux is great for complex action flows, but overkill here. The boilerplate (actions, reducers, selectors, dispatch) slows down development for a real-time app where most "actions" are just "new data arrived, update the number."

### Why Not React Context?
Context re-renders **all consumers** when any value changes. If the price updates 2x/second, every component using the context re-renders — even the ones that only need the leverage value. This kills performance.

### Why Zustand Works

```tsx
// Each component subscribes to ONLY the data it needs
const orderBook = useTradingStore(s => s.orderBook)      // OrderBook component
const leverage = useTradingStore(s => s.leverage)          // OrderForm component
const selectedMarket = useTradingStore(s => s.selectedMarket) // Header component
```

Zustand's selector pattern means:
- When `orderBook` changes, only `OrderBook.tsx` re-renders
- When `leverage` changes, only `OrderForm.tsx` re-renders
- The chart doesn't re-render when the order form changes

This is critical for a trading UI where different data streams update at different rates.

---

## Real-Time Data Simulation

### How It Works

```
useTickSimulation(600ms)
        |
        v
  tickPrice() in Zustand
        |
        |-- Update market price (random walk)
        |-- Update mark price
        |-- Recalculate all position PnLs
        |-- Generate new trade entry
        +-- Regenerate orderbook around new price
```

### Why This Architecture

In production, this would be a WebSocket connection:
```
WebSocket message -> parse -> store.setState()
```

The mock simulation mirrors this exact pattern. The `tickPrice()` function is the single entry point where all derived state gets updated atomically. This means:
- No intermediate states where price is updated but PnL isn't
- No race conditions between orderbook and trade tape
- Easy to swap mock for real WebSocket — just call the same setter

### Why 600ms Interval

Real exchanges send data at varying rates (orderbook: 100ms, trades: per-event, candles: per-interval). 600ms is a balanced simulation that:
- Shows visible movement (not too slow)
- Doesn't overwhelm the browser (not too fast)
- Approximates a moderate-activity market

---

## Layout Architecture

```
+------------------------------------------------------------------+
|  Header (market selector, stats bar, wallet)                     |
+----------------------------------------+-------------------------+
|                                        |                         |
|                                        |     OrderBook           |
|         TradingChart                   |     (bid/ask depth)     |
|         (candlestick + volume)         |                         |
|                                        +-------------+-----------+
|                                        |             |           |
|                                        |  Recent     |  Order    |
+----------------------------------------+  Trades     |  Form     |
|                                        |             |           |
|  PositionsTable                        |             |           |
|  (open positions, orders, history)     |             |           |
|                                        |             |           |
+----------------------------------------+-------------+-----------+
```

**Why this layout:**
- Chart gets the most space — it's the primary decision-making tool
- Orderbook is adjacent to the chart — traders look between them constantly
- Order form is on the far right — it's the "action" column, used after analysis
- Positions at the bottom — checked periodically, not constantly stared at
- This mirrors dYdX, Binance Futures, and Hyperliquid layouts

**CSS approach:** Flexbox with fixed right sidebar width (580px) and fluid left column. This ensures the chart always gets maximum space while the orderbook/form maintain readable column widths.

---

## Custom Theme System

```css
@theme {
  --color-panel: #111827;       /* Card/panel backgrounds */
  --color-surface: #0A0F1A;     /* Page background (deepest dark) */
  --color-long: #22c55e;        /* Buy/long — universal green */
  --color-short: #ef4444;       /* Sell/short — universal red */
  --color-long-dim: rgba(34, 197, 94, 0.15);   /* Depth bar fills */
  --color-short-dim: rgba(239, 68, 68, 0.15);  /* Depth bar fills */
  --color-accent: #8b5cf6;      /* Interactive highlights */
}
```

**Why these colors:**
- **Green/Red for long/short** — universal trading convention. Never deviate from this.
- **Deep dark background (#0A0F1A)** — traders stare at screens for hours. OLED-dark reduces eye strain and makes colored data (prices, PnL) pop.
- **Purple accent (#8b5cf6)** — neutral color that doesn't conflict with green/red semantics. Used for leverage, active tabs, wallet badge.
- **Two dark levels (surface vs panel)** — creates depth without borders everywhere. Panels float on the surface.

**Typography:**
- **IBM Plex Sans** for UI text — clean, professional, excellent readability at small sizes
- **JetBrains Mono** for numbers — monospaced ensures columns of numbers align perfectly. Critical for orderbook and position tables.

---

## Production Considerations

Things to add for a real trading platform:

| Feature | Implementation |
|---|---|
| **Real WebSocket** | Replace `useTickSimulation` with actual WS connection to exchange backend |
| **Wallet integration** | ethers.js / wagmi for EVM, @solana/web3.js for Solana |
| **Order submission** | Call smart contract or backend API on form submit |
| **Authentication** | Sign-in-with-Ethereum (SIWE) or wallet signature |
| **Persistent state** | LocalStorage for user preferences (leverage defaults, layout) |
| **Error boundaries** | React error boundaries around each panel so one crash doesn't kill the whole UI |
| **Web Workers** | Move orderbook aggregation to a worker thread for ultra-high-frequency data |
| **Virtualization** | Virtual scrolling for trade history with 10k+ entries |

---

## License

MIT
