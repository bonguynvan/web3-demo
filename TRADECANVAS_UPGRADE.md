# Upgrading to @tradecanvas/chart 0.7.x

> Migration guide for TradingDek — replaces the arrow-drawing workarounds
> with native Signal Markers and Trade Zones APIs.

## Install

```bash
pnpm add @tradecanvas/chart@^0.7.0
```

All existing APIs (`Chart`, `BinanceAdapter`, `ChartWidget`, themes, types) are
unchanged. This is a **fully additive** release — no breaking changes.

---

## What's New (relevant to TradingDek)

| Feature | Before (0.6) | After (0.7) |
|---------|-------------|-------------|
| Signal markers | Manual arrow drawings via `signalChartMarkers.ts` | `chart.addSignalMarker()` — native overlay with confidence sizing, source colors, labels |
| Trade zones | No visualization (only position overlay) | `chart.addTradeZone()` — entry→exit rectangles with P&L coloring |
| Backtest replay markers | Manual `setDrawings()` with arrow shapes | `chart.addSignalMarker()` + `chart.addTradeZone()` — progressive entry/exit visualization |
| Multi-chart | Not available | `ChartGrid` — synchronized multi-chart layouts |
| Command palette | Not available | `Ctrl+K` search in `ChartWidget` |
| Chart types | 12 types | 16 types (+Volume Candles, HLC Area, Step Line, Line+Markers) |

---

## 1. Replace `signalChartMarkers.ts` with native Signal Markers

### Before — `src/lib/signalChartMarkers.ts`

```typescript
// Old: 87 lines of manual arrow-drawing construction
import type { Signal } from '../signals/types'

export function buildSignalDrawings(signals: Signal[], selectedMarketId: string) {
  // ... manually builds { type: 'arrow', anchors: [tail, head], style: { color, ... } }
}

// In TradingChart.tsx:
const signalDrawings = buildSignalDrawings(signals, selectedMarket.id)
const userDrawings = chart.getDrawings().filter(d => !isSignalDrawing(d))
chart.setDrawings([...userDrawings, ...signalDrawings])
```

### After — direct API call

```typescript
import type { Signal } from '../signals/types'
import type { Chart, SignalMarker } from '@tradecanvas/chart'

function syncSignalMarkers(chart: Chart, signals: Signal[], marketId: string) {
  chart.clearSignalMarkers()

  for (const s of signals) {
    if (s.marketId !== marketId) continue
    if (s.suggestedPrice == null || !Number.isFinite(s.suggestedPrice)) continue

    chart.addSignalMarker({
      time: s.triggeredAt,
      price: s.suggestedPrice,
      direction: s.direction,           // 'long' | 'short' — matches Signal type
      confidence: s.confidence,          // 0..1 — arrow size scales automatically
      source: s.source,                  // 'funding' | 'crossover' | 'rsi' | etc.
      label: s.title,                    // "Funding spike", "EMA Cross", etc.
    })
  }
}
```

### Customize per-source colors

```typescript
// Call once after chart creation
chart.setSignalMarkerStyle({
  longColor: '#26d984',        // your existing green
  shortColor: '#ff5d6d',       // your existing red
  arrowSize: 14,
  showLabel: true,
  showConfidence: true,
  sourceColors: {
    funding: '#FF9800',
    crossover: '#2196F3',
    rsi: '#9C27B0',
    volatility: '#FF5722',
    liquidation: '#F44336',
    news: '#4CAF50',
    whale: '#00BCD4',
    confluence: '#FFD700',
  },
})
```

### What to delete

- `src/lib/signalChartMarkers.ts` — entire file
- In `TradingChart.tsx`:
  - Remove `buildSignalDrawings()` / `isSignalDrawing()` imports
  - Remove the `setDrawings([...userDrawings, ...signalDrawings])` merge logic
  - Replace with `syncSignalMarkers(chart, signals, selectedMarket.id)` in the
    signal change effect

---

## 2. Visualize Bot Trades with Trade Zones

### Before — only position overlay

```typescript
// Only shows CURRENT open positions as horizontal lines
chart.setPositions([{ id, side, entryPrice, quantity }])
```

### After — full entry→exit rectangles for every trade

```typescript
import type { BotTrade } from '../bots/types'
import type { Chart } from '@tradecanvas/chart'

function syncBotTrades(chart: Chart, trades: BotTrade[]) {
  chart.clearTradeZones()

  for (const t of trades) {
    chart.addTradeZone({
      entryTime: t.openedAt,
      entryPrice: t.entryPrice,
      exitTime: t.closedAt,                         // undefined if still open
      exitPrice: t.closePrice,                       // undefined if still open
      direction: t.direction,                        // 'long' | 'short'
      pnl: t.pnlUsd,                                // shown as badge on closed zones
      pnlPercent: t.pnlUsd != null && t.entryPrice > 0
        ? (t.pnlUsd / t.positionUsd) * 100
        : undefined,
      label: t.botId,                                // optional
    })
  }
}
```

### Live trade updates

When a bot trade closes, update the zone in-place instead of rebuilding all:

```typescript
// When trade closes:
chart.updateTradeZone(`tc_zone_${zoneId}`, {
  exitTime: trade.closedAt,
  exitPrice: trade.closePrice,
  pnl: trade.pnlUsd,
  pnlPercent: (trade.pnlUsd! / trade.positionUsd) * 100,
})
```

Or use the simpler pattern — re-call `syncBotTrades()` on every trade state change.

### Customize colors

```typescript
chart.setTradeZoneStyle({
  profitColor: '#22c55e',      // matches your PERP_DARK candleUp
  lossColor: '#ef4444',        // matches your PERP_DARK candleDown
  activeColor: '#3b82f6',      // blue for open trades
  fillOpacity: 0.12,
  showPnl: true,
  showLabel: true,
})
```

---

## 3. Upgrade BacktestReplayPage

The replay page currently uses manual arrow drawings for entry/exit markers.
Replace with native APIs for richer visualization.

### Before — `BacktestReplayPage.tsx` lines 252-302

```typescript
// Old: builds arrow drawings manually
const drawings: unknown[] = []
for (const t of load.result.trades) {
  if (t.openedAtIdx > cur) continue
  drawings.push({
    id: `entry-${t.id}`,
    type: 'arrow',
    anchors: [
      { time: entryBar.time, price: isLong ? t.entryPrice - offset : t.entryPrice + offset },
      { time: entryBar.time, price: t.entryPrice },
    ],
    style: { color: isLong ? '#22c55e' : '#ef4444', lineWidth: 3, ... },
  })
  // ... similar for exit arrow
}
chart.setDrawings(drawings as any)
```

### After — signal markers for entries, trade zones for full trades

```typescript
useEffect(() => {
  const chart = chartRef.current
  if (!chart || load.kind !== 'ready') return
  const { candles, result } = load
  const cur = replay.candleIdx

  chart.clearSignalMarkers()
  chart.clearTradeZones()

  for (const t of result.trades) {
    if (t.openedAtIdx > cur) continue

    const entryBar = candles[t.openedAtIdx]

    // Entry arrow
    chart.addSignalMarker({
      time: entryBar.time,
      price: t.entryPrice,
      direction: t.direction,
      confidence: 1,
      source: t.signalSource,
      label: t.direction === 'long' ? 'BUY' : 'SELL',
    })

    // Trade zone (shows when exit is visible)
    if (t.closedAtIdx <= cur) {
      const closeBar = candles[t.closedAtIdx]
      chart.addTradeZone({
        entryTime: entryBar.time,
        entryPrice: t.entryPrice,
        exitTime: closeBar.time,
        exitPrice: t.closePrice,
        direction: t.direction,
        pnl: t.pnlUsd,
        label: `${t.closeReason}`,
      })
    } else {
      // Active trade — zone extends to current bar
      chart.addTradeZone({
        entryTime: entryBar.time,
        entryPrice: t.entryPrice,
        direction: t.direction,
      })
    }
  }
}, [replay.candleIdx, load])
```

### What to delete

- Remove the entire `drawings` array construction block
- Remove the `chart.setDrawings(drawings as any)` call
- Remove the comment about "matching DrawingState shape"

---

## 4. Listen for Events

New event types you can subscribe to:

```typescript
chart.on('signalMarkerAdd', (e) => {
  console.log('Signal added:', e.payload)
  // { id, source, direction }
})

chart.on('tradeZoneAdd', (e) => {
  console.log('Trade zone added:', e.payload)
  // { id, direction }
})

chart.on('signalMarkerRemove', (e) => {
  console.log('Signal removed:', e.payload.id)
})

chart.on('tradeZoneRemove', (e) => {
  console.log('Zone removed:', e.payload.id)
})
```

---

## 5. New Type Imports

```typescript
// All available from the main entry point
import type {
  SignalMarker,
  SignalDirection,
  SignalMarkerStyle,
  TradeZone,
  TradeZoneDirection,
  TradeZoneStyle,
} from '@tradecanvas/chart'

// Default styles (for reference/customization)
import {
  DEFAULT_SIGNAL_STYLE,
  DEFAULT_TRADE_ZONE_STYLE,
} from '@tradecanvas/chart'
```

---

## 6. New Chart Types Available

You can now use these in your chart type switcher:

```typescript
// New in 0.7
'volumeCandles'    // Candlestick width varies by relative volume
'hlcArea'          // High-low band with close line overlay
'stepLine'         // Staircase pattern between data points
'lineWithMarkers'  // Line chart with circular markers at each point
```

---

## 7. Multi-Chart Grid (optional)

For the screener or multi-market view:

```typescript
import { ChartGrid } from '@tradecanvas/chart'

const grid = new ChartGrid(container, {
  layout: '2x2',
  theme: 'dark',
  adapter: new BinanceAdapter(),
})

grid.connectAll(
  new BinanceAdapter(),
  ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
  '5m',
)
```

---

## 8. Command Palette (ChartWidget only)

If you use `ChartWidget` instead of bare `Chart`, `Ctrl+K` now opens a
command palette for searching indicators, chart types, drawing tools, and
timeframes. No code changes needed — it's built in.

---

## Quick Migration Checklist

- [ ] `pnpm add @tradecanvas/chart@^0.7.0`
- [ ] Delete `src/lib/signalChartMarkers.ts`
- [ ] In `TradingChart.tsx`: replace drawing-merge with `syncSignalMarkers()`
- [ ] In `TradingChart.tsx`: add `syncBotTrades()` for live trade visualization
- [ ] In `BacktestReplayPage.tsx`: replace arrow drawings with signal markers + trade zones
- [ ] Call `chart.setSignalMarkerStyle()` once with your source color map
- [ ] Call `chart.setTradeZoneStyle()` once to match PERP_DARK/PERP_LIGHT colors
- [ ] Add `'volumeCandles' | 'hlcArea' | 'stepLine' | 'lineWithMarkers'` to your chart type switcher (optional)
- [ ] Test: signals render as arrows, trades render as colored rectangles, replay shows progressive markers

---

## API Reference (Signal Markers)

| Method | Returns | Description |
|--------|---------|-------------|
| `chart.addSignalMarker(marker)` | `string` (id) | Add a signal marker |
| `chart.removeSignalMarker(id)` | `void` | Remove by id |
| `chart.getSignalMarkers()` | `SignalMarker[]` | Get all markers |
| `chart.setSignalMarkers(markers)` | `void` | Replace all markers |
| `chart.clearSignalMarkers()` | `void` | Remove all markers |
| `chart.setSignalMarkerStyle(style)` | `void` | Customize appearance |

### SignalMarker

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `time` | `number` | yes | Bar timestamp (ms) |
| `price` | `number` | yes | Y-axis price level |
| `direction` | `'long' \| 'short' \| 'neutral'` | yes | Arrow direction |
| `confidence` | `number` | yes | 0–1 score (scales arrow size) |
| `source` | `string` | yes | Source identifier |
| `label` | `string` | no | Text label near marker |
| `color` | `string` | no | Override color |
| `meta` | `Record<string, unknown>` | no | Custom data |

## API Reference (Trade Zones)

| Method | Returns | Description |
|--------|---------|-------------|
| `chart.addTradeZone(zone)` | `string` (id) | Add a trade zone |
| `chart.updateTradeZone(id, updates)` | `void` | Update zone fields |
| `chart.removeTradeZone(id)` | `void` | Remove by id |
| `chart.getTradeZones()` | `TradeZone[]` | Get all zones |
| `chart.setTradeZones(zones)` | `void` | Replace all zones |
| `chart.clearTradeZones()` | `void` | Remove all zones |
| `chart.setTradeZoneStyle(style)` | `void` | Customize appearance |

### TradeZone

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entryTime` | `number` | yes | Entry bar timestamp (ms) |
| `entryPrice` | `number` | yes | Entry price level |
| `exitTime` | `number` | no | Exit timestamp (omit for open trades) |
| `exitPrice` | `number` | no | Exit price level |
| `direction` | `'long' \| 'short'` | yes | Trade direction |
| `pnl` | `number` | no | Profit/loss value |
| `pnlPercent` | `number` | no | P&L percentage |
| `label` | `string` | no | Optional trade label |
| `meta` | `Record<string, unknown>` | no | Custom data |
