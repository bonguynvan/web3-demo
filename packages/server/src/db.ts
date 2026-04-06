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
  timestamp: number
}

const insertTradeStmt = () => getDb().prepare(`
  INSERT OR IGNORE INTO trades
  (block_number, tx_hash, log_index, event_type, account, index_token, is_long, size_delta, collateral_delta, price, fee, timestamp)
  VALUES (@block_number, @tx_hash, @log_index, @event_type, @account, @index_token, @is_long, @size_delta, @collateral_delta, @price, @fee, @timestamp)
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

export function resetDatabase() {
  const db = getDb()
  db.exec('DELETE FROM trades; DELETE FROM prices; DELETE FROM sync_state;')
}
