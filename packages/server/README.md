# @perp-dex/server

Backend for the Perp DEX. Indexes on-chain events into SQLite, exposes REST + WebSocket APIs to the frontend.

## Stack

- **Hono** — HTTP framework (port 3001)
- **ws** — WebSocket server (port 3002)
- **viem** — RPC client + ABI handling
- **better-sqlite3** — embedded database (`data/indexer.db`)
- **tsx** — runs TypeScript directly, no build step needed

ABIs and contract addresses come from `packages/contracts/typechain` so the indexer cannot drift from the contracts.

## Run

```bash
# from monorepo root
cd packages/server
pnpm install              # first time only
pnpm dev                  # tsx watch — auto-restarts on edit
```

Or one-shot:

```bash
pnpm start
```

Anvil must be running on `http://127.0.0.1:8545` and contracts must be deployed (see `packages/contracts/script/DeployLocal.s.sol`).

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `RPC_URL` | `http://127.0.0.1:8545` | Ethereum RPC endpoint |
| `PORT` | `3001` | HTTP port |
| `WS_PORT` | `3002` | WebSocket port |
| `USDC_ADDRESS` | typechain default | Override for non-Anvil deploys |
| `WETH_ADDRESS` | typechain default | |
| `WBTC_ADDRESS` | typechain default | |
| `PRICE_FEED_ADDRESS` | typechain default | |
| `VAULT_ADDRESS` | typechain default | |
| `POSITION_MANAGER_ADDRESS` | typechain default | |
| `ROUTER_ADDRESS` | typechain default | |
| `PLP_ADDRESS` | typechain default | |
| `ETH_ORACLE_ADDRESS` | typechain default | |
| `BTC_ORACLE_ADDRESS` | typechain default | |

For local Anvil dev nothing needs to be set — the typechain `LOCALHOST_ADDRESSES` are the deterministic Foundry deploy.

## REST endpoints

All responses use the envelope `{ success: true, data: ... }` or `{ success: false, error: '...' }`.

### `GET /`
Health check + endpoint list.

### `GET /health`
```json
{ "ok": true, "wsSubscribers": 0 }
```

### `GET /api/markets`
List of supported markets.
```json
{ "success": true, "data": [
  { "symbol": "ETH-PERP", "baseAsset": "ETH", "indexToken": "0x..." },
  { "symbol": "BTC-PERP", "baseAsset": "BTC", "indexToken": "0x..." }
]}
```

### `GET /api/markets/:symbol/stats`
24h stats for a single market. Computed from the `prices` table (oracle snapshots) and the `trades` table (executed fills).
```json
{ "success": true, "data": {
  "symbol": "ETH-PERP",
  "baseAsset": "ETH",
  "indexToken": "0x...",
  "price": 3500.42,
  "priceTime": 1712592345,
  "change24h": 1.23,
  "change24hUsd": 42.51,
  "high24h": 3520.10,
  "low24h": 3480.00,
  "volume24h": 1250000.00,
  "trades24h": 142
}}
```

**Funding rate and open interest are intentionally omitted** — the contracts don't expose a funding accumulator yet, and OI tracking needs a separate snapshot table.

### `GET /api/markets/:symbol/candles?timeframe=5m&limit=200&from=&to=`
True OHLCV candles aggregated from indexed trade events. Volume is the sum of notional traded in the bucket.

Allowed `timeframe` values: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`.
`from` and `to` are unix seconds; default range covers the last `limit` buckets.

```json
{ "success": true, "data": [
  { "time": 1712592000, "open": 3499, "high": 3502, "low": 3498, "close": 3501, "volume": 12500 }
], "meta": { "timeframe": "5m", "from": 1712591400, "to": 1712592300, "bucketCount": 1 }}
```

### `GET /api/trades?token=0x...&limit=50`
Recent fill events globally or filtered by `index_token`.

### `GET /api/positions/:address`
Returns `{ current, history }` for one wallet — `current` is read live from `PositionManager.getPosition`, `history` is from the indexed trades table.

### `GET /api/prices/:token?interval=300&limit=200`
OHLC candles aggregated from oracle price snapshots (sampled every 5s by the indexer). Use this for the chart background even when no trades are flowing yet.

`token` is one of: `eth`, `weth`, `btc`, `wbtc`.

**Difference vs `/api/markets/:symbol/candles`:** prices candles never have gaps (oracle is always polled) but volume is just the sample count, not real notional. Markets candles have real notional but only contain buckets where trades happened.

## WebSocket channels

Connect to `ws://localhost:3002`.

### `prices` channel
```js
ws.send(JSON.stringify({ type: 'subscribe', channel: 'prices' }))
// Receives every 3s while subscribed:
// { type: 'price', token: 'ETH', tokenAddress: '0x...', price: 3500.42, priceRaw: '3500420000000000000000000000000000', timestamp: 1712592345 }
```

### `events` channel
```js
ws.send(JSON.stringify({ type: 'subscribe', channel: 'events', address: '*' }))
// Receives on every new fill:
// { type: 'trade', eventType: 'increase', account: '0x...', token: 'ETH', isLong: true, sizeDelta: 1000, price: 3500.42, timestamp: 1712592345, txHash: '0x...' }
```

Pass an explicit `address` (lowercase 0x…) to filter to a single wallet's fills, or `'*'` for all.

## Database schema

SQLite, WAL mode, located at `packages/server/data/indexer.db`. Schema is hard-coded in `src/db.ts:initSchema()` — there is no migration system. Breaking changes require deleting the file.

Tables:
- `trades` — one row per `IncreasePosition` / `DecreasePosition` / `LiquidatePosition` event. Unique on `(tx_hash, log_index)`.
- `prices` — oracle price snapshots, one per token per 5s tick.
- `sync_state` — single-row cursor (`last_block`).

Indexes:
- `trades(account)`, `trades(index_token)`, `trades(block_number)`, `trades(timestamp)`
- `prices(token, timestamp)`

## Indexer lifecycle

1. **Startup** — read `last_block` from `sync_state`. If chain block number is lower than the cursor (Anvil restart), wipe the database and re-index from block 0.
2. **Backfill** — `getContractEvents` from `last_block + 1` → `currentBlock` for all three event types in parallel. Block timestamps are pre-fetched in parallel and cached.
3. **Watch** — `watchContractEvent` for each event. New batches are written transactionally and broadcast over the `events` WebSocket channel.
4. **Price poller** — every 5s, `getLatestPrice(token)` for ETH and BTC, append to `prices` table.

Block timestamps are real (`block.timestamp`), not `Date.now()`. Cached up to 5000 blocks.

## Known limits

- **No reorg handling beyond Anvil restart detection.** A real testnet reorg would create duplicate or orphaned events. The unique `(tx_hash, log_index)` constraint protects against duplicates but won't roll back orphaned blocks.
- **No rate limiting.** Fine for localhost dev; add a reverse proxy before exposing publicly.
- **No auth.** All routes are public. WebSocket address filter is not authenticated — anyone can subscribe to anyone's events.
- **No Postgres path.** SQLite is fine for solo dev; if you need horizontal scale, swap `db.ts` to a Drizzle + Postgres adapter.
- **Funding rate not exposed.** Waiting on Phase 2 contract work.

## Tests

None yet. Manual testing is via curl or the frontend (`src/lib/apiClient.ts` will appear in the next phase).

```bash
# Smoke check after starting the server:
curl http://localhost:3001/api/markets | jq
curl http://localhost:3001/api/markets/ETH-PERP/stats | jq
curl 'http://localhost:3001/api/markets/ETH-PERP/candles?timeframe=1m&limit=10' | jq
```
