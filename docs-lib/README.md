# @chart-lib — Trading Chart Library

A high-performance TypeScript charting library for financial data. HTML5 Canvas 2D rendering, 26 indicators, 24 drawing tools, trading-on-chart, compare symbols, log scale, session breaks, data export, multi-language, Vietnam stock market support. Runs on web, Tauri, Electron — any platform with a browser engine.

## Features

- **11 chart types**: Candlestick, Heikin Ashi, Hollow Candle, Baseline, Line, Area, OHLC Bar, Renko, Kagi, Line Break, Point & Figure
- **26 technical indicators** — 9 overlay + 17 panel
- **24 drawing tools** — trend lines, fibonacci, Gann fan/box, anchored VWAP, volume profile range, shapes, channels, annotations, measurement
- **Trading on chart** — order placement, position display, draggable SL/TP, order book depth, context menu
- **Compare symbols** — overlay multiple symbols with percentage normalization
- **Logarithmic scale** — toggle between linear and log price axis
- **Session break lines** — automatic day boundary markers
- **Bar countdown timer** — time remaining until current candle closes
- **Data export** — CSV/JSON export of visible or full dataset
- **Configurable panel layout** — indicator panels positionable top/bottom/left/right
- **Multi-language (i18n)** — English, Vietnamese built-in, extensible
- **Vietnam stock market** — HOSE/HNX/UPCOM presets, VN color scheme, ceiling/floor lines
- **Alerts, Replay, Screenshot, Save/Load** — price alerts with persistence, bar-by-bar replay, PNG export, JSON state persistence
- **Multi-layer canvas** with dirty-flag render optimization and Path2D batching
- **Tauri IPC bridge** — forward chart events to Rust backend
- **Dark/Light themes** with full customization
- **Real-time streaming** — StreamManager with auto-reconnect, tick aggregation, current price line, pluggable adapters
- **Plugin system** — custom indicators, drawing tools, and data adapters
- **Serializable** — save/restore drawings, orders, settings

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Data Interfaces](#data-interfaces)
- [Chart API](#chart-api)
- [Indicators](#indicators)
- [Drawing Tools](#drawing-tools)
- [Trading on Chart](#trading-on-chart)
- [Panel Layout](#configurable-panel-layout)
- [i18n (Multi-Language)](#multi-language-i18n)
- [Vietnam Stock Market](#vietnam-stock-market)
- [Themes](#themes)
- [Tauri Integration](#tauri-integration)
- [Events](#events)
- [Performance](#performance)
- [Running the Demos](#running-the-demos)

---

## Installation

```bash
npm install @chart-lib/library
```

---

## Quick Start

```typescript
import { Chart } from '@chart-lib/library';
import type { OHLCBar } from '@chart-lib/library';

const chart = new Chart(document.getElementById('chart')!, {
  chartType: 'candlestick',
  theme: 'dark',
  autoScale: true,
  crosshair: { mode: 'magnet' },
});

chart.setData(myOHLCBars);
chart.addIndicator('sma', { period: 20 });
chart.addIndicator('rsi', { period: 14 });
chart.on('crosshairMove', (e) => console.log(e.payload));
```

---

## Data Interfaces

### Core Data

```typescript
// The fundamental bar data structure
interface OHLCBar {
  time: number;      // Unix timestamp in milliseconds
  open: number;      // Opening price
  high: number;      // Highest price
  low: number;       // Lowest price
  close: number;     // Closing price
  volume: number;    // Trading volume
}

// Array of bars
type DataSeries = OHLCBar[];

// Supported timeframes
// 26 supported timeframes
type TimeFrame =
  | '1s' | '5s' | '15s' | '30s'                    // Seconds
  | '1m' | '3m' | '5m' | '15m' | '30m' | '45m'     // Minutes
  | '1h' | '2h' | '3h' | '4h' | '6h' | '8h' | '12h' // Hours
  | '1d' | '2d' | '3d'                               // Days
  | '1w' | '2w'                                       // Weeks
  | '1M' | '3M' | '6M' | '12M';                      // Months

// Individual tick/trade
interface TickData {
  time: number;
  price: number;
  volume?: number;
}
```

### Chart Configuration

```typescript
interface ChartOptions {
  chartType: ChartType;               // See 11 chart types above
  width?: number;                     // Auto-detect from container if omitted
  height?: number;
  theme?: ThemeName | Theme;          // 'dark' | 'light' | custom Theme object
  autoScale?: boolean;                // Auto-fit price range (default: true)
  rightMargin?: number;               // Empty bars at right edge
  minBarSpacing?: number;             // Min pixels per bar (default: 2)
  maxBarSpacing?: number;             // Max pixels per bar (default: 30)
  logScale?: boolean;                 // Start with logarithmic price scale
  grid?: GridOptions;
  crosshair?: CrosshairOptions;
  priceAxis?: PriceAxisOptions;
  timeAxis?: TimeAxisOptions;
  watermark?: WatermarkConfig;
  sessionBreaks?: SessionBreakOptions;
  features?: FeaturesConfig;          // Feature toggles (see below)
}

interface SessionBreakOptions {
  visible?: boolean;                  // Show day-boundary lines (default: true)
  color?: string;                     // Line color (default: theme.axisLine)
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;                 // Default: 1
}

interface GridOptions {
  visible: boolean;
  hLineColor?: string;
  vLineColor?: string;
  hLineStyle?: 'solid' | 'dashed' | 'dotted';
  vLineStyle?: 'solid' | 'dashed' | 'dotted';
}

interface CrosshairOptions {
  mode: 'normal' | 'magnet' | 'hidden';
  hLine?: CrosshairLineOptions;
  vLine?: CrosshairLineOptions;
}

interface CrosshairLineOptions {
  visible?: boolean;
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  width?: number;
  labelVisible?: boolean;
  labelBackground?: string;
}

interface FeaturesConfig {
  // Drawing tools
  drawings?: boolean;                 // Enable drawing tools (default: true)
  drawingTools?: DrawingToolType[];   // Whitelist of allowed tools
  drawingMagnet?: boolean;            // Magnet snap to OHLC
  drawingUndoRedo?: boolean;          // Ctrl+Z / Ctrl+Y

  // Trading
  trading?: boolean;                  // Enable trading features
  tradingContextMenu?: boolean;       // Right-click order menu

  // Indicators
  indicators?: boolean;               // Enable indicator overlays/panels
  indicatorIds?: string[];            // Whitelist of allowed indicator IDs

  // Interactions
  panning?: boolean;                  // Mouse/touch pan
  zooming?: boolean;                  // Scroll/pinch zoom
  crosshair?: boolean;                // Crosshair cursor
  keyboard?: boolean;                 // Keyboard shortcuts

  // UI elements
  priceAxis?: boolean;                // Price axis
  timeAxis?: boolean;                 // Time axis
  grid?: boolean;                     // Grid lines
  legend?: boolean;                   // OHLCV legend
  volume?: boolean;                   // Volume bars
  watermark?: boolean;                // Watermark text

  // Features
  saveLoad?: boolean;                 // Chart state save/load
  screenshot?: boolean;               // PNG screenshot
  alerts?: boolean;                   // Price alerts
  replay?: boolean;                   // Bar replay
  sessionBreaks?: boolean;            // Session break lines
  barCountdown?: boolean;             // Bar countdown timer
  compareSymbols?: boolean;           // Compare/overlay symbols
  dataExport?: boolean;               // CSV/JSON export
  logScale?: boolean;                 // Log scale toggle

  // Timeframes
  timeframes?: TimeFrame[];            // Whitelist of available timeframes
  defaultTimeframeFavorites?: TimeFrame[]; // Default quick-access bar
}

interface PriceAxisOptions {
  visible?: boolean;
  width?: number;
  position?: 'left' | 'right';
  scaleType?: 'linear' | 'log' | 'percentage';
}

interface TimeAxisOptions {
  visible?: boolean;
  height?: number;
}
```

### Viewport & Geometry

```typescript
interface ViewportState {
  visibleRange: { from: number; to: number };  // Visible bar indices
  priceRange: { min: number; max: number };     // Visible price range
  barWidth: number;          // Pixels per bar
  barSpacing: number;        // Gap between bars
  offset: number;            // Horizontal scroll offset
  chartRect: Rect;           // Drawable area bounds
  logScale?: boolean;        // True when using logarithmic price scale
}

interface Point { x: number; y: number; }
interface Size  { width: number; height: number; }
interface Rect  { x: number; y: number; width: number; height: number; }
```

### Theme

```typescript
type ThemeName = 'dark' | 'light';

interface Theme {
  name: string;
  background: string;
  text: string;
  textSecondary: string;
  grid: string;
  crosshair: string;
  candleUp: string;            // Bullish candle body
  candleDown: string;          // Bearish candle body
  candleUpWick: string;
  candleDownWick: string;
  lineColor: string;           // Line/area chart color
  areaTopColor: string;        // Area gradient top
  areaBottomColor: string;     // Area gradient bottom
  volumeUp: string;
  volumeDown: string;
  axisLine: string;
  axisLabel: string;
  axisLabelBackground: string;
  font: FontConfig;
}

interface FontConfig {
  family: string;
  sizeSmall: number;           // 10px
  sizeMedium: number;          // 12px
  sizeLarge: number;           // 14px
}
```

### Indicator Types

```typescript
type IndicatorPlacement = 'overlay' | 'panel';

interface IndicatorDescriptor {
  id: string;                              // e.g. 'sma', 'rsi'
  name: string;                            // Display name
  placement: IndicatorPlacement;           // Where it renders
  defaultConfig: Record<string, unknown>;  // Default parameters
}

interface IndicatorConfig {
  id: string;                              // Indicator type
  instanceId: string;                      // Unique instance ID
  params: Record<string, number | string | boolean>;
  style?: IndicatorStyleConfig;
  visible?: boolean;
}

interface IndicatorOutput {
  values: Map<number, IndicatorValue>;     // Keyed by timestamp (backward compat)
  series?: (IndicatorValue | null)[];      // Array indexed by bar position (fast path)
  meta?: Record<string, unknown>;
}

interface IndicatorValue {
  [key: string]: number | undefined;       // e.g. { value: 50 } or { k: 70, d: 65 }
}

// Plugin interface for custom indicators
interface IndicatorPlugin {
  descriptor: IndicatorDescriptor;
  calculate(data: DataSeries, config: IndicatorConfig): IndicatorOutput;
  render(ctx: CanvasRenderingContext2D, output: IndicatorOutput,
         viewport: ViewportState, style: ResolvedIndicatorStyle): void;
}
```

### Drawing Types

```typescript
type DrawingToolType =
  | 'trendLine' | 'horizontalLine' | 'verticalLine' | 'ray' | 'extendedLine'
  | 'parallelChannel' | 'regressionChannel'
  | 'fibRetracement' | 'fibExtension'
  | 'rectangle' | 'ellipse' | 'triangle'
  | 'pitchfork' | 'elliottWave'
  | 'gannFan' | 'gannBox'
  | 'anchoredVWAP' | 'volumeProfileRange'
  | 'priceRange' | 'dateRange' | 'measure'
  | 'text' | 'arrow';

interface AnchorPoint {
  time: number;      // Bar index
  price: number;     // Price level
}

interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  fillOpacity?: number;
  fontSize?: number;
  text?: string;     // For text tool
}

interface DrawingState {
  id: string;
  type: DrawingToolType;
  anchors: AnchorPoint[];
  style: DrawingStyle;
  visible: boolean;
  locked: boolean;
  meta?: Record<string, unknown>;
}

// Plugin interface for custom drawing tools
interface DrawingPlugin {
  descriptor: DrawingDescriptor;
  render(ctx: CanvasRenderingContext2D, state: DrawingState,
         viewport: ViewportState, selected: boolean): void;
  hitTest(point: Point, state: DrawingState,
          viewport: ViewportState, tolerance: number): boolean;
  hitTestAnchor(point: Point, state: DrawingState,
                viewport: ViewportState, tolerance: number): number;
}
```

### Trading Types

```typescript
type OrderSide   = 'buy' | 'sell';
type OrderType   = 'market' | 'limit' | 'stop' | 'stopLimit';
type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';

interface TradingOrder {
  id: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  stopPrice?: number;       // For stop-limit orders
  quantity: number;
  label?: 'LIMIT' | 'STOP' | 'SL' | 'TP' | 'STOP LIMIT';
  draggable?: boolean;      // Default: true
  meta?: Record<string, unknown>;
}

interface TradingPosition {
  id: string;
  side: OrderSide;
  entryPrice: number;
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
  meta?: Record<string, unknown>;
}

interface DepthData {
  bids: DepthLevel[];       // Sorted descending by price
  asks: DepthLevel[];       // Sorted ascending by price
}

interface DepthLevel {
  price: number;
  volume: number;
}

interface TradingConfig {
  enabled: boolean;
  orderColors?: { buy?: string; sell?: string };
  positionColors?: { profit?: string; loss?: string; entry?: string };
  depthOverlay?: { enabled?: boolean; bidColor?: string; askColor?: string; maxWidth?: number };
  contextMenu?: { enabled?: boolean };
  pricePrecision?: number;
  dragThreshold?: number;   // Pixels before drag starts
}

// Event payloads
interface OrderPlaceIntent   { side: OrderSide; type: OrderType; price: number; quantity?: number }
interface OrderModifyIntent  { orderId: string; newPrice: number; previousPrice: number }
interface OrderCancelIntent  { orderId: string }
interface PositionModifyIntent { positionId: string; stopLoss?: number; takeProfit?: number }
```

### Event Types

```typescript
type ChartEventType =
  | 'crosshairMove' | 'click' | 'barClick'
  | 'visibleRangeChange' | 'priceRangeChange' | 'zoomChange'
  | 'dataUpdate' | 'indicatorAdd' | 'indicatorRemove'
  | 'themeChange' | 'resize'
  | 'orderPlace' | 'orderModify' | 'orderCancel'
  | 'positionClose' | 'positionModify'
  | 'drawingCreate' | 'drawingRemove';

interface ChartEvent<T = unknown> {
  type: ChartEventType;
  timestamp: number;
  payload: T;
}

interface CrosshairMovePayload {
  point: Point;
  bar?: OHLCBar;
  barIndex?: number;
  indicatorValues?: Record<string, IndicatorValue>;
}

interface BarClickPayload { bar: OHLCBar; barIndex: number; point: Point }
interface TauriBridgeOptions { enabled: boolean; eventPrefix?: string }
```

### Market Types

```typescript
type MarketType     = 'crypto' | 'stock' | 'forex';
type StockExchange  = 'HOSE' | 'HNX' | 'UPCOM' | 'NYSE' | 'NASDAQ' | string;
type PanelPosition  = 'top' | 'bottom' | 'left' | 'right';

interface MarketConfig {
  type: MarketType;
  exchange?: StockExchange;
  currency?: string;
  pricePrecision?: number;
  volumeUnit?: number;            // e.g. 10 for VN lots
  priceStep?: number;             // Min price increment
  priceLimits?: {
    enabled: boolean;
    ceilingPercent?: number;      // e.g. 7 for HOSE
    floorPercent?: number;
    referencePrice?: number;
  };
  sessions?: TradingSession[];
  colorScheme?: MarketColorScheme;
}

interface TradingSession {
  name: string;
  startTime: string;              // "09:00"
  endTime: string;                // "14:45"
  type: 'preOpen' | 'continuous' | 'preClose' | 'closed';
}

interface MarketColorScheme {
  up: string;
  down: string;
  unchanged: string;
  ceiling: string;
  floor: string;
  reference: string;
}
```

### i18n Types

```typescript
type Locale = 'en' | 'vi' | 'zh' | 'ja' | 'ko' | 'th' | string;

// 100+ translatable keys for all UI text
interface LocaleStrings {
  candlestick: string; line: string; area: string; bar: string;
  price: string; volume: string; open: string; high: string; low: string; close: string;
  sma: string; ema: string; rsi: string; macd: string; // ... all indicator names
  trendLine: string; horizontalLine: string; // ... all drawing tool names
  buy: string; sell: string; stopLoss: string; takeProfit: string; // ... trading
  ceiling: string; floor: string; reference: string; // ... market
  settings: string; theme: string; loading: string; // ... UI
  numberDecimalSeparator: string; numberGroupSeparator: string;
}
```

### Layout Types

```typescript
interface PanelConfig {
  id: string;
  position: PanelPosition;        // 'top' | 'bottom' | 'left' | 'right'
  size: number;                    // Pixels
  minSize: number;
  content: { type: 'indicator' | 'custom'; indicatorInstanceId?: string };
}

interface ResolvedLayout {
  mainChartRect: Rect;
  panels: ResolvedPanel[];
  dividers: DividerRect[];
}
```

---

## Real-time Streaming

### Quick Start

```typescript
import { Chart, BinanceAdapter } from '@chart-lib/library';

const chart = new Chart(container, { chartType: 'candlestick', theme: 'dark' });

// One line to connect — handles history, streaming, reconnection, price line
await chart.connect({
  adapter: new BinanceAdapter(),
  symbol: 'BTCUSDT',
  timeframe: '1m',
});

// Switch symbol/timeframe without full reconnect
await chart.switchStream('ETHUSDT', '5m');

// Disconnect
chart.disconnectStream();
```

### Architecture

```
DataAdapter (pluggable)     StreamManager (orchestrator)     Chart
  │                              │                              │
  ├─ fetchHistory() ──────────→  ├─ snapshot ─────────────────→ setData()
  ├─ connect() / WebSocket ──→  ├─ barUpdate ─────────────────→ updateLastBar()
  │   ├─ tick events ────────→  │   (via TickAggregator)       │
  │   ├─ bar events ─────────→  ├─ barClose ──────────────────→ appendBar()
  │   └─ disconnect ─────────→  ├─ priceChange ───────────────→ CurrentPriceLine
  │                              └─ reconnect (auto, backoff)  │
  ReconnectManager ←────────────┘                              │
```

### Built-in Adapters

**BinanceAdapter** — Binance public API (no key required)
```typescript
import { BinanceAdapter } from '@chart-lib/library';
const adapter = new BinanceAdapter();
// Optional: custom endpoints
const adapter = new BinanceAdapter({ restBase: 'https://...', wsBase: 'wss://...' });
```

**MockAdapter** — For testing, demos, VN stock simulation
```typescript
import { MockAdapter } from '@chart-lib/library';
const adapter = new MockAdapter({
  basePrice: 72000,     // VNM stock price * 1000
  volatility: 1.5,      // % volatility
  tickInterval: 2000,    // ms between ticks
});
```

### Custom Adapter

Implement the `DataAdapter` interface to connect any data source:

```typescript
import type { DataAdapter, DataAdapterConfig, OHLCBar, TimeFrame } from '@chart-lib/library';

class MyBrokerAdapter implements DataAdapter {
  readonly name = 'my-broker';

  async fetchHistory(symbol: string, tf: TimeFrame, limit?: number): Promise<OHLCBar[]> {
    // Fetch from your API
    const res = await fetch(`https://api.mybroker.com/klines?s=${symbol}&tf=${tf}&limit=${limit}`);
    return res.json();
  }

  connect(config: DataAdapterConfig): void {
    // Open WebSocket to your broker
    this.ws = new WebSocket(`wss://stream.mybroker.com/${config.symbol}`);
    this.ws.onmessage = (e) => {
      const tick = JSON.parse(e.data);
      this.emit('bar', { bar: tick, closed: tick.isClosed });
    };
    this.emit('connectionChange', 'connected');
  }

  disconnect(): void { this.ws?.close(); }
  // ... on(), off(), dispose(), getConnectionState()
}
```

### StreamManager (standalone usage)

Use StreamManager directly without Chart for custom integrations:

```typescript
import { StreamManager, BinanceAdapter } from '@chart-lib/library';

const stream = new StreamManager();

stream.on('snapshot', (bars) => console.log('History:', bars.length));
stream.on('barClose', (bar) => console.log('New bar:', bar));
stream.on('barUpdate', (bar) => console.log('Forming:', bar.close));
stream.on('priceChange', ({ price }) => console.log('Price:', price));
stream.on('connectionChange', (info) => console.log('State:', info.state));
stream.on('error', (err) => console.error(err.message));

await stream.connect({
  adapter: new BinanceAdapter(),
  symbol: 'BTCUSDT',
  timeframe: '1m',
  autoScroll: true,
  historyLimit: 500,
  reconnect: {
    enabled: true,
    maxRetries: Infinity,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
});
```

### Tick Aggregation

For raw tick streams (trade-by-trade data), enable tick aggregation:

```typescript
await chart.connect({
  adapter: myTickAdapter,
  symbol: 'BTCUSDT',
  timeframe: '1m',
  aggregateTicks: true,  // Build OHLCV bars from individual ticks
});
```

The `TickAggregator` aligns ticks to timeframe boundaries, manages bar open/close transitions, and accumulates volume.

### Current Price Line

Automatically rendered when streaming is active — a horizontal dashed line at the last price with a colored badge. Flashes briefly on price changes.

```typescript
// Enabled by default when using chart.connect()
// Manual control:
chart.connect({ ..., showCurrentPriceLine: true });
```

### Connection States

| State | Description |
|---|---|
| `disconnected` | Not connected |
| `connecting` | Fetching history / opening WebSocket |
| `connected` | Streaming live data |
| `reconnecting` | Connection lost, retrying with backoff |
| `error` | Failed after max retries |

```typescript
chart.getConnectionState();   // 'connected'
chart.getConnectionInfo();    // { state, reconnectAttempt, lastMessageTime }
```

### Auto-Scroll

```typescript
chart.setAutoScroll(true);    // Scroll to latest bar on new data (default)
chart.setAutoScroll(false);   // User controls scroll position
```

---

## Chart API

### Constructor

```typescript
const chart = new Chart(container: HTMLElement, options: ChartOptions);
```

### Data

```typescript
chart.setData(data: OHLCBar[]);           // Replace entire dataset
chart.appendBar(bar: OHLCBar);            // New bar (candle closed)
chart.updateLastBar(bar: OHLCBar);        // Update current forming bar
```

### Chart Type

```typescript
chart.setChartType(type: ChartType);
// ChartType: 'candlestick' | 'heikinAshi' | 'hollowCandle' | 'baseline'
//          | 'line' | 'area' | 'bar' | 'renko' | 'kagi' | 'lineBreak' | 'pointAndFigure'
```

### Viewport

```typescript
chart.scrollToEnd();
chart.scrollTo(timestamp: number);
chart.setVisibleRange(fromTs: number, toTs: number);
chart.zoomIn();  chart.zoomOut();  chart.fitContent();
```

### Timeframe Presets

```typescript
import { TIMEFRAMES_CRYPTO, TIMEFRAMES_STOCK, TIMEFRAMES_FOREX, DEFAULT_TIMEFRAME_FAVORITES } from '@chart-lib/library';

// Use market-specific presets in FeaturesConfig
const chart = new Chart(container, {
  chartType: 'candlestick',
  features: {
    timeframes: TIMEFRAMES_CRYPTO,                     // Only these TFs available
    defaultTimeframeFavorites: ['1m', '5m', '15m', '1h', '4h', '1d'],
  },
});

// Presets:
// TIMEFRAMES_CRYPTO: 1s, 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
// TIMEFRAMES_STOCK:  1m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w, 1M, 3M, 6M, 12M
// TIMEFRAMES_FOREX:  1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M
```

### Alerts

```typescript
chart.addAlert(price, 'crossing', 'BTC hit 50k');   // Add price alert
chart.clearAlerts();                                   // Remove all alerts
// Fires 'dataUpdate' event with { alert: 'triggered', price, message }
```

### Log Scale

```typescript
chart.setLogScale(true);           // Switch to logarithmic price scale
chart.setLogScale(false);          // Back to linear
chart.isLogScale();                // Check current mode
```

### Session Breaks

```typescript
chart.setSessionBreaksVisible(true);                          // Show day separators
chart.setSessionBreaksConfig({ color: '#555', lineStyle: 'dotted', lineWidth: 1 });
```

### Compare Symbols

```typescript
chart.addCompareSymbol('eth', 'ETHUSDT', ethBars, '#9C27B0');   // Overlay ETH on main chart
chart.updateCompareData('eth', newEthBars);                       // Update compare data
chart.removeCompareSymbol('eth');                                  // Remove overlay
chart.setCompareMode('percent');   // Normalize from first visible bar (default)
chart.setCompareMode('absolute');  // Raw price values
chart.clearCompareSymbols();       // Remove all
```

### Bar Countdown

```typescript
chart.setBarCountdownVisible(true);     // Show time remaining on current candle
```

### Data Export

```typescript
chart.exportVisibleData('csv', 'btc-visible.csv');   // Download visible bars as CSV
chart.exportVisibleData('json');                       // Download as JSON
chart.exportAllData('csv', 'btc-full.csv');           // Download entire dataset
```

### Drawing Duplication

```typescript
chart.duplicateDrawing();          // Duplicate currently selected drawing
chart.duplicateDrawing('draw_5');  // Duplicate by ID
// Also: Ctrl+D keyboard shortcut when a drawing is selected
```

### Indicator Editing

```typescript
const indicators = chart.getActiveIndicators();           // List active indicators
const config = chart.getIndicatorConfig(instanceId);      // Get params for an indicator
chart.updateIndicatorStyle(instanceId, {
  colors: ['#FF5722'], lineWidths: [2], opacity: 0.8,
});
```

### Replay

```typescript
chart.replay({ speed: 2, interval: 200 });    // Replay historical data
chart.setReplaySpeed(4);                        // Change speed during replay
chart.replayStop();                             // Stop replay
chart.getReplayProgress();                      // { current, total, percent }
```

### Screenshot & Save/Load

```typescript
chart.screenshot('chart.png');                  // Download chart as PNG
chart.saveState('my-chart');                    // Save to localStorage
chart.loadStateFromStorage('my-chart');         // Restore from localStorage
chart.downloadState('chart.json');              // Download full state as JSON
chart.loadStateFromFile();                      // Load from file picker
```

### Lifecycle

```typescript
chart.resize();   // Manual resize (auto via ResizeObserver)
chart.destroy();  // Cleanup everything
```

---

## Indicators

### Add/Remove

```typescript
const id = chart.addIndicator('sma', { period: 20 });
chart.updateIndicator(id, { period: 50 });
chart.removeIndicator(id);
const output = chart.getIndicatorOutput(id);
Chart.indicators(); // List all available
```

### Panel Position

```typescript
chart.addIndicator('rsi', { period: 14 }, 'bottom');   // default
chart.addIndicator('macd', {}, 'right');
chart.setPanelPosition(id, 'left');
chart.setPanelSize(id, 200);
```

### Overlay Indicators (9)

| ID | Name | Parameters |
|---|---|---|
| `sma` | Simple Moving Average | `period` |
| `ema` | Exponential Moving Average | `period` |
| `bb` | Bollinger Bands | `period`, `stdDev` |
| `vwap` | VWAP | — |
| `ichimoku` | Ichimoku Cloud | `tenkan`, `kijun`, `senkou`, `displacement` |
| `psar` | Parabolic SAR | `step`, `max` |
| `supertrend` | Supertrend | `period`, `multiplier` |
| `keltner` | Keltner Channel | `emaPeriod`, `atrPeriod`, `multiplier` |
| `donchian` | Donchian Channel | `period` |

### Panel Indicators (17)

| ID | Name | Parameters | Output Keys |
|---|---|---|---|
| `rsi` | RSI | `period` | `value` |
| `macd` | MACD | `fast`, `slow`, `signal` | `macd`, `signal`, `histogram` |
| `stochastic` | Stochastic | `kPeriod`, `dPeriod`, `smooth` | `k`, `d` |
| `atr` | ATR | `period` | `value` |
| `adx` | ADX | `period` | `adx`, `plusDI`, `minusDI` |
| `obv` | OBV | — | `value` |
| `williamsR` | Williams %R | `period` | `value` |
| `cci` | CCI | `period` | `value` |
| `mfi` | MFI | `period` | `value` |
| `aroon` | Aroon | `period` | `up`, `down` |
| `roc` | ROC | `period` | `value` |
| `tsi` | TSI | `longPeriod`, `shortPeriod`, `signalPeriod` | `tsi`, `signal` |
| `cmf` | CMF | `period` | `value` |
| `stddev` | Standard Deviation | `period` | `value` |
| `volumeProfile` | Volume Profile | `rows` | `price`, `volume` |
| `ad` | Accumulation/Distribution | — | `value` |
| `vroc` | Volume ROC | `period` | `value` |

---

## Drawing Tools

```typescript
chart.setDrawingTool('trendLine');        // Activate tool
chart.setDrawingTool(null);               // Deactivate
chart.setDrawingStyle({ color: '#FF5722', lineWidth: 2, lineStyle: 'dashed' });
chart.getDrawings();                       // Serialize
chart.setDrawings(saved);                  // Restore
chart.clearDrawings();
chart.removeDrawing(id);
```

| Tool | Anchors | Description |
|---|---|---|
| `trendLine` | 2 | Line between two points |
| `horizontalLine` | 1 | Infinite horizontal at price |
| `verticalLine` | 1 | Infinite vertical at time |
| `ray` | 2 | Line extending in one direction |
| `extendedLine` | 2 | Infinite line through two points |
| `parallelChannel` | 3 | Two parallel lines + fill |
| `regressionChannel` | 2 | Center line + parallel bands |
| `fibRetracement` | 2 | 7 Fibonacci levels (0-100%) |
| `fibExtension` | 3 | 8 extension levels |
| `rectangle` | 2 | Filled rectangle |
| `ellipse` | 2 | Ellipse with optional fill |
| `triangle` | 3 | Three-point triangle |
| `pitchfork` | 3 | Andrews' Pitchfork (3 prongs) |
| `elliottWave` | 8 | Wave labels 1-5, A-B-C |
| `priceRange` | 2 | Shows price diff + percentage |
| `dateRange` | 2 | Shows bar count |
| `measure` | 2 | Price + bars + percentage |
| `text` | 1 | Text annotation |
| `arrow` | 2 | Arrow with head |
| `gannFan` | 2 | Gann Fan — 9 angle lines (8x1 to 1x8) |
| `gannBox` | 2 | Gann Box — grid with price/time divisions + diagonals |
| `anchoredVWAP` | 1 | VWAP from anchor bar to end, with ±1σ/±2σ bands |
| `volumeProfileRange` | 2 | Volume histogram for selected time range with POC |

**Interaction:** Click to place anchors. Escape cancels. Click drawing to select. Drag to move. Drag anchor handles to resize. Delete to remove. Ctrl+D to duplicate selected drawing.

---

## Trading on Chart

```typescript
// Display orders (chart is UI-only, backend executes)
chart.setOrders([
  { id: 'o1', side: 'buy', type: 'limit', price: 42000, quantity: 0.5 },
  { id: 'o2', side: 'sell', type: 'stop', price: 43500, quantity: 0.5, label: 'TP' },
]);

// Display positions with P&L
chart.setPositions([
  { id: 'p1', side: 'buy', entryPrice: 41800, quantity: 0.5, stopLoss: 41000, takeProfit: 43500 },
]);

// Real-time P&L updates
chart.setCurrentPrice(42150);

// Order book depth
chart.setDepthData({ bids: [...], asks: [...] });
chart.setTradingConfig({ depthOverlay: { enabled: true } });

// Events (emit intents, backend executes)
chart.on('orderPlace', (e) => { /* e.payload: OrderPlaceIntent */ });
chart.on('orderModify', (e) => { /* e.payload: OrderModifyIntent */ });
chart.on('positionModify', (e) => { /* e.payload: PositionModifyIntent */ });
```

**Right-click** chart for context menu: Buy Limit, Sell Limit, Buy Stop, Sell Stop.
**Drag** order lines or SL/TP lines to modify price.

---

## Configurable Panel Layout

```typescript
chart.addIndicator('rsi', {}, 'bottom');    // default
chart.addIndicator('macd', {}, 'right');
chart.addIndicator('obv', {}, 'left');
chart.addIndicator('atr', {}, 'top');
chart.setPanelPosition(rsiId, 'right');
chart.setPanelSize(rsiId, 200);
```

---

## Multi-Language (i18n)

```typescript
import { setLocale, t, registerLocale, formatNumber, formatVND } from '@chart-lib/library';

chart.setLocale('vi');
t('buy');                              // 'Mua'
t('stopLoss');                         // 'Cắt lỗ'
formatNumber(42150.5, 2);             // "42,150.50" (en)
formatNumber(42150.5, 2, 'vi');       // "42.150,50" (vi)
formatVND(72000);                      // "72.000"

registerLocale('zh', { buy: '买入', sell: '卖出', ... });
```

Built-in: `en` (English), `vi` (Vietnamese). Extensible to any language.

---

## Vietnam Stock Market

```typescript
import { MARKET_HOSE, MARKET_HNX, MARKET_UPCOM } from '@chart-lib/library';

chart.setMarket(MARKET_HOSE);
chart.setLocale('vi');
chart.setPriceLimits(72000);  // Reference price -> ceiling/floor lines
```

### VN Color Convention

| Color | Meaning | Hex |
|---|---|---|
| Red | Price up (tăng) | `#FF0000` |
| Blue | Price down (giảm) | `#0000FF` |
| Purple | Ceiling (trần) | `#FF00FF` |
| Cyan | Floor (sàn) | `#00FFFF` |
| Yellow | Reference (tham chiếu) | `#FFD700` |

### Market Presets

| Preset | Exchange | Limit | Price Step | Sessions |
|---|---|---|---|---|
| `MARKET_HOSE` | HOSE | ±7% | 0.05 | ATO, Continuous, ATC |
| `MARKET_HNX` | HNX | ±10% | 0.1 | Continuous, ATC |
| `MARKET_UPCOM` | UPCOM | ±15% | 0.1 | Continuous, ATC |
| `MARKET_CRYPTO` | — | None | — | 24/7 |
| `MARKET_NYSE` | NYSE | None | 0.01 | Pre-Market, Regular, After-Hours |

---

## Themes

```typescript
chart.setTheme('dark');
chart.setTheme('light');

// Custom theme
import { DARK_THEME } from '@chart-lib/library';
chart.setTheme({ ...DARK_THEME, candleUp: '#00ff88', background: '#1a1a2e' });

// VN market theme (auto-applied by setMarket)
import { createVNTheme } from '@chart-lib/library';
chart.setTheme(createVNTheme(DARK_THEME));
```

---

## Tauri Integration

```typescript
chart.enableTauriBridge({ eventPrefix: 'chart' });
// All events forwarded via window.__TAURI__.event.emit('chart:eventType', payload)
```

**Rust backend:**
```rust
handle.listen("chart:orderPlace", |event| {
    println!("Order: {:?}", event.payload());
});

#[tauri::command]
fn place_order(intent: OrderPlaceIntent) -> Result<TradingOrder, String> { ... }
```

No `@tauri-apps/api` dependency in the library. Runtime detection of `window.__TAURI__`.

---

## Events

```typescript
chart.on('crosshairMove', handler);    // { point, bar?, barIndex? }
chart.on('barClick', handler);         // { bar, barIndex, point }
chart.on('visibleRangeChange', handler);
chart.on('dataUpdate', handler);
chart.on('indicatorAdd', handler);
chart.on('indicatorRemove', handler);
chart.on('themeChange', handler);
chart.on('resize', handler);
chart.on('orderPlace', handler);       // OrderPlaceIntent
chart.on('orderModify', handler);      // OrderModifyIntent
chart.on('positionModify', handler);   // PositionModifyIntent
chart.on('drawingCreate', handler);
chart.on('drawingRemove', handler);
chart.off('crosshairMove', handler);
```

---

## Running the Demos

### Browser Demo
```bash
pnpm install && pnpm run build
cd demo && pnpm run dev        # http://localhost:3000
```

### Tauri v2 + Svelte 5 Desktop
```bash
cargo install tauri-cli
cd tauri-demo && pnpm tauri dev
```

Features: Market selector (Crypto/HOSE/HNX), language switcher (EN/VI), all 26 indicators, 24 drawing tools, trading on chart, settings panel, live streaming, log scale, session breaks, compare symbols, data export.

---

## Performance

The library is optimized for 60fps rendering with large datasets (100K+ bars):

### Rendering
- **Path2D batching** — candles, wicks, volume bars, and OHLC bars are collected into Path2D objects grouped by color (up/down), then drawn with a single `fill()`/`stroke()` call per color. This reduces draw calls from O(n) to O(1) per frame.
- **Inlined coordinate math** — bar-to-pixel and price-to-pixel conversions are pre-computed as constants per frame, eliminating function call overhead per bar.
- **Multi-layer canvas with dirty flags** — only the affected layer redraws (e.g., crosshair moves only redraw the Overlay layer).
- **Zero-allocation render loop** — swap-set pattern in the render loop, cached layer references, pre-built font strings.

### Indicators
- **Array-indexed output** — indicator values stored in `series[]` array indexed by bar position. Render iterates `series[from..to]` directly — no Map sorting or allocation per frame.
- **O(n) calculations** — Bollinger Bands uses running sum/sum-of-squares; MACD uses incremental EMA without intermediate arrays; Ichimoku precomputes rolling high/low.

### Interaction
- **Deferred crosshair callback** — fires via `queueMicrotask` after render, only when the hovered bar changes. Tooltip uses pre-built DOM and CSS `transform` positioning (GPU-composited, no layout thrash).
- **Momentum scrolling** — pan velocity tracked during drag, exponential decay (friction: 0.92) applied via rAF after release.
- **Debounced resize** — ResizeObserver collapsed to one callback per frame, with size-change detection.

### Axes
- **Single-path grid** — all horizontal and vertical grid lines drawn in one `beginPath`/`stroke`.
- **Reused Date object** — time axis formats labels with a single reused `Date` instance instead of allocating per bar.
- **Batched label rendering** — price axis draws all label backgrounds first, then all text, minimizing `fillStyle` switches.

---

## Architecture

```
@chart-lib/library    Public Chart API
       │
@chart-lib/core       Rendering, indicators, drawings, trading, interaction
       │
@chart-lib/commons    Types, utils, themes, i18n, market presets
```

### Canvas Layers (bottom to top)
1. **Background** — Grid + session break lines + watermark. Redraws on zoom/pan.
2. **Main** — Chart (Path2D-batched) + volume + compare overlays + overlay indicators + panel indicators (clip-rendered per panel).
3. **Overlay** — Price limits + drawings + trading orders + current price line + crosshair. Only this layer redraws on mouse move.
4. **UI** — Price axis + time axis + legend + bar countdown.

### Platform Support
| Platform | How |
|---|---|
| Web (any browser) | Import `@chart-lib/library` |
| Tauri (desktop/mobile) | Same import + optional IPC bridge |
| Electron | Same import |
| React/Vue/Svelte/Angular | Framework-agnostic — `new Chart(element, opts)` |

**Browser requirements:** Canvas 2D, ResizeObserver, requestAnimationFrame, ES2022+.

---

## Recent Changes (Perp DEX Integration)

Changes made while integrating the chart library into the Perp DEX trading platform:

### New: `updateLastBarFromTick()` Method

Convenience method for live price feeds — merges a raw tick into the current last bar without constructing a full `OHLCBar`:

```typescript
// Before: had to build the full bar yourself
chart.updateLastBar({
  time: last.time, open: last.open,
  high: Math.max(last.high, price),
  low: Math.min(last.low, price),
  close: price, volume: last.volume + 1,
});

// After: just pass the tick
chart.updateLastBarFromTick({ price: 3498.50, volume: 1, time: Date.now() });
```

Delegates to `DataManager.updateLastBarFromTick()` which was already implemented but not exposed on the `Chart` class.

### New: Standalone Current Price Line

The `CurrentPriceLine` (dashed line + badge showing the latest price) previously only worked when using `StreamManager.connect()`. Now it works in all data modes:

```typescript
// Explicit control
chart.setCurrentPrice(3498.50);  // Shows dashed line + badge on price axis

// Auto-updated by:
chart.setData(bars);             // Sets price from last bar's close
chart.updateLastBar(bar);        // Updates from bar.close
chart.updateLastBarFromTick(t);  // Updates from tick.price
```

The price line renders on the **Overlay** layer (same as crosshair) — redraws independently without touching the main chart canvas.

### Changed: Chart Legend

The legend overlay (top-left OHLCV display) no longer shows the chart type name. Before: `ETH-PERP · 5m · candlestick`. After: `ETH-PERP · 5m`. Matches TradingView behavior where chart type is shown in the toolbar, not on the chart.

### Performance: Streaming Optimization

For high-frequency data feeds (1000+ ticks/sec), two optimizations were added:

**1. Skip `displayDataCache` invalidation for standard chart types**

`updateLastBar()` and `updateLastBarFromTick()` no longer set `displayDataCache = null` when the chart type is `candlestick`, `line`, `area`, `bar`, or `hollowCandle`. These types use the raw data array directly (no transform), so the cache reference remains valid after in-place mutation.

For transform types (heikinAshi, renko, kagi, lineBreak, pointAndFigure), the cache is still invalidated since the derived array needs recomputation.

**2. `scheduleRender()` coalescing**

Already existed but documented here: multiple calls to `scheduleRender()` within the same frame collapse into a single `requestAnimationFrame` callback. The `renderScheduled` flag prevents duplicate scheduling.

```
1000 ticks/sec → 1000 updateLastBar() calls → 1000 scheduleRender() calls
                                              → 1 rAF callback (60fps)
                                              → 1 canvas redraw
```

### Integration Pattern: React + Zustand + Chart

Recommended pattern for connecting a Zustand store to the chart at high frequency:

```typescript
// ❌ Bad: useEffect with store data as dependency
useEffect(() => {
  chart.setData(candles); // Full redraw on every tick!
}, [candles]);

// ✅ Good: rAF-throttled store subscription
useEffect(() => {
  let rafId = 0;
  let dirty = false;

  const unsub = store.subscribe(() => {
    dirty = true;
    if (!rafId) rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (!dirty) return;
      dirty = false;
      const { candles } = store.getState();
      // Differentiate: setData vs appendBar vs updateLastBar
      if (candles.length > prevCount) chart.appendBar(last);
      else chart.updateLastBar(last);
    });
  });

  return () => { unsub(); cancelAnimationFrame(rafId); };
}, []);
```

### Integration Pattern: TickEngine → Chart (Zero-Alloc)

For maximum throughput (10,000+ ticks/sec), bypass React entirely:

```typescript
import { TickEngine } from './tickEngine';

const engine = new TickEngine();
engine.start(candleIntervalMs, (payload) => {
  if (payload.newCandleStarted && payload.completed) {
    chart.appendBar(payload.completed);
  }
  chart.updateLastBar(payload.current);
  chart.setCurrentPrice(payload.lastPrice);
});

// Hot path — called 1000+/s, zero allocation
websocket.onmessage = (msg) => {
  engine.ingestTick(msg.price, msg.volume, msg.timestamp);
};
```

The `TickEngine` uses a pre-allocated `Float64Array` ring buffer (2048 entries) and aggregates OHLCV in place — zero GC pressure in the hot path.
