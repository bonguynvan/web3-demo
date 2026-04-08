/**
 * SQLite database for indexed on-chain data.
 *
 * Tables:
 *   - trades: IncreasePosition / DecreasePosition / LiquidatePosition events
 *   - prices: Oracle price snapshots (for OHLC candle generation)
 *   - sync_state: Last indexed block number
 */

import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', 'data', 'indexer.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema()
    runSchemaUpgrades()
  }
  return db
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_number INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('increase', 'decrease', 'liquidate')),
      account TEXT NOT NULL,
      index_token TEXT NOT NULL,
      is_long INTEGER NOT NULL,
      size_delta TEXT NOT NULL,
      collateral_delta TEXT NOT NULL,
      price TEXT NOT NULL,
      fee TEXT NOT NULL,
      usdc_out TEXT NOT NULL DEFAULT '0',
      timestamp INTEGER NOT NULL,
      UNIQUE(tx_hash, log_index)
    );

    CREATE INDEX IF NOT EXISTS idx_trades_account ON trades(account);
    CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(index_token);
    CREATE INDEX IF NOT EXISTS idx_trades_block ON trades(block_number);
    CREATE INDEX IF NOT EXISTS idx_trades_time ON trades(timestamp);

    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      price TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prices_token_time ON prices(token, timestamp);

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

/**
 * Idempotent in-place schema upgrades.
 *
 * SQLite doesn't support `ADD COLUMN IF NOT EXISTS` until 3.35+, and we want
 * to work on older versions too. Each upgrade is wrapped in a try/catch and
 * ignores the "duplicate column" error so reruns are safe.
 *
 * Add new entries here when extending the schema. Never remove an entry —
 * old databases need every step to reach the current shape.
 */
function runSchemaUpgrades(): void {
  // Added 2026-04: usdc_out column on trades for realised PnL on closes.
  // Pre-existing decrease rows will keep the default '0', so PnL on
  // historical closes will remain blank until the indexer re-fills them.
  try {
    db.exec(`ALTER TABLE trades ADD COLUMN usdc_out TEXT NOT NULL DEFAULT '0'`)
  } catch (err) {
    if (!isDuplicateColumnError(err)) {
      throw err
    }
  }
}

function isDuplicateColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /duplicate column name/i.test(msg)
}

// ─── Sync state helpers ───

export function getLastIndexedBlock(): bigint {
  const db = getDb()
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get('last_block') as { value: string } | undefined
  return row ? BigInt(row.value) : 0n
}

export function setLastIndexedBlock(block: bigint) {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run('last_block', block.toString())
}

// ─── Trade inserts ───

export interface TradeRow {
  block_number: number
  tx_hash: string
  log_index: number
  event_type: 'increase' | 'decrease' | 'liquidate'
  account: string
  index_token: string
  is_long: number
  size_delta: string
  collateral_delta: string
  price: string
  fee: string
  /** USDC paid back to receiver on a decrease (close). '0' for opens and liquidations. */
  usdc_out: string
  timestamp: number
}

const insertTradeStmt = () => getDb().prepare(`
  INSERT OR IGNORE INTO trades
  (block_number, tx_hash, log_index, event_type, account, index_token, is_long, size_delta, collateral_delta, price, fee, usdc_out, timestamp)
  VALUES (@block_number, @tx_hash, @log_index, @event_type, @account, @index_token, @is_long, @size_delta, @collateral_delta, @price, @fee, @usdc_out, @timestamp)
`)

export function insertTrade(trade: TradeRow) {
  insertTradeStmt().run(trade)
}

export function insertTrades(trades: TradeRow[]) {
  const stmt = insertTradeStmt()
  const transaction = getDb().transaction((items: TradeRow[]) => {
    for (const item of items) {
      stmt.run(item)
    }
  })
  transaction(trades)
}

// ─── Price inserts ───

export function insertPrice(token: string, price: string, blockNumber: number, timestamp: number) {
  getDb().prepare('INSERT INTO prices (token, price, block_number, timestamp) VALUES (?, ?, ?, ?)')
    .run(token, price, blockNumber, timestamp)
}

// ─── Queries ───

export function getRecentTrades(limit = 50, token?: string): TradeRow[] {
  const db = getDb()
  if (token) {
    return db.prepare('SELECT * FROM trades WHERE index_token = ? ORDER BY timestamp DESC, id DESC LIMIT ?')
      .all(token.toLowerCase(), limit) as TradeRow[]
  }
  return db.prepare('SELECT * FROM trades ORDER BY timestamp DESC, id DESC LIMIT ?')
    .all(limit) as TradeRow[]
}

export function getTradesByAccount(account: string, limit = 100): TradeRow[] {
  return getDb().prepare('SELECT * FROM trades WHERE account = ? ORDER BY timestamp DESC LIMIT ?')
    .all(account.toLowerCase(), limit) as TradeRow[]
}

export interface PriceRow {
  token: string
  price: string
  timestamp: number
}

export function getPriceHistory(token: string, limit = 500): PriceRow[] {
  return getDb().prepare('SELECT token, price, timestamp FROM prices WHERE token = ? ORDER BY timestamp DESC LIMIT ?')
    .all(token.toLowerCase(), limit) as PriceRow[]
}

// ─── Market stats queries ───────────────────────────────────────────────────

export interface MarketStats24h {
  /** Latest indexed price (raw 30-dec string) */
  latestPriceRaw: string | null
  latestPriceTime: number | null
  /** Price 24h ago (raw 30-dec string) */
  priceOpen24hRaw: string | null
  /** 24h high price (raw 30-dec string) */
  high24hRaw: string | null
  /** 24h low price (raw 30-dec string) */
  low24hRaw: string | null
  /** Sum of size_delta over all trades in the last 24h (raw 30-dec string) */
  volume24hRaw: string
  /** Trade count in the last 24h */
  trades24h: number
}

/**
 * Compute 24h stats for a single token. Reads from both `prices` (oracle
 * snapshots — the indexer polls every 5s) and `trades` (executed fills).
 */
export function get24hStats(token: string): MarketStats24h {
  const db = getDb()
  const lower = token.toLowerCase()
  const now = Math.floor(Date.now() / 1000)
  const since = now - 24 * 3600

  // Latest oracle snapshot.
  const latest = db
    .prepare('SELECT price, timestamp FROM prices WHERE token = ? ORDER BY timestamp DESC LIMIT 1')
    .get(lower) as { price: string; timestamp: number } | undefined

  // First snapshot inside the 24h window — used as the "open" reference.
  const open = db
    .prepare('SELECT price FROM prices WHERE token = ? AND timestamp >= ? ORDER BY timestamp ASC LIMIT 1')
    .get(lower, since) as { price: string } | undefined

  // High/low across the window. SQLite has no MAX(BigIntString) so we pull
  // candidates ordered and take extremes in JS — fine because volume is small.
  const window = db
    .prepare('SELECT price FROM prices WHERE token = ? AND timestamp >= ?')
    .all(lower, since) as { price: string }[]

  let highRaw: bigint | null = null
  let lowRaw: bigint | null = null
  for (const row of window) {
    const v = BigInt(row.price)
    if (highRaw === null || v > highRaw) highRaw = v
    if (lowRaw === null || v < lowRaw) lowRaw = v
  }

  // Volume + count from trades. Sum is computed in JS because the values are
  // BigInt-string and SQLite SUM() would silently truncate to double.
  const fills = db
    .prepare('SELECT size_delta FROM trades WHERE index_token = ? AND timestamp >= ?')
    .all(lower, since) as { size_delta: string }[]

  let volumeRaw = 0n
  for (const f of fills) volumeRaw += BigInt(f.size_delta)

  return {
    latestPriceRaw: latest?.price ?? null,
    latestPriceTime: latest?.timestamp ?? null,
    priceOpen24hRaw: open?.price ?? null,
    high24hRaw: highRaw?.toString() ?? null,
    low24hRaw: lowRaw?.toString() ?? null,
    volume24hRaw: volumeRaw.toString(),
    trades24h: fills.length,
  }
}

// ─── Candle queries from trade events ───────────────────────────────────────

export interface RawTradeForCandles {
  size_delta: string
  price: string
  timestamp: number
}

/**
 * Pull every trade for `token` between `from` and `to` (inclusive), oldest
 * first. Caller buckets these into OHLCV candles.
 */
export function getTradesForCandles(
  token: string,
  from: number,
  to: number,
): RawTradeForCandles[] {
  return getDb()
    .prepare(
      'SELECT size_delta, price, timestamp FROM trades WHERE index_token = ? AND timestamp BETWEEN ? AND ? ORDER BY timestamp ASC',
    )
    .all(token.toLowerCase(), from, to) as RawTradeForCandles[]
}

export function resetDatabase() {
  const db = getDb()
  db.exec('DELETE FROM trades; DELETE FROM prices; DELETE FROM sync_state;')
}
