/// <reference path="../pb_data/types.d.ts" />
//
// Community proof aggregation — opt-in resolved-signal rows.
//
// The SPA's per-user ledger (localStorage `tc-signal-performance-v1`)
// stays the source of truth for an individual user. When they opt in,
// we mirror resolved rows to this table so the public /proof page can
// show a network-wide aggregate that beats single-user noise.
//
// Anonymous: only the SPA-generated device_id (UUIDv4) is stored — no
// wallet, email, or IP. Same signal may arrive from many devices
// (signals are deterministic per market+time), so we don't dedup at
// write time; the aggregator just averages.
//
// Rules: writes happen via the /api/proof/contribute Go handler with
// shape validation. Reads happen via /api/proof/aggregate. The
// collection's own list/view rules stay null so individual rows
// never leak.

migrate((app) => {
  const proof = new Collection({
    type: 'base',
    name: 'proof_contributions',
    fields: [
      { name: 'device_id', type: 'text', required: true, max: 64 },
      { name: 'source', type: 'select', values: ['funding', 'crossover', 'rsi', 'volatility', 'liquidation', 'news', 'whale', 'confluence'], required: true, maxSelect: 1 },
      { name: 'market_id', type: 'text', required: true, max: 32 },
      { name: 'direction', type: 'select', values: ['long', 'short'], required: true, maxSelect: 1 },
      { name: 'hit', type: 'bool' },
      { name: 'closed_at', type: 'date' },
      { name: 'created', type: 'date' },
    ],
    indexes: [
      'CREATE INDEX `idx_proof_source_created` ON `proof_contributions` (`source`, `created`)',
      'CREATE INDEX `idx_proof_device` ON `proof_contributions` (`device_id`)',
      'CREATE INDEX `idx_proof_created` ON `proof_contributions` (`created`)',
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  app.save(proof)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('proof_contributions')) } catch (_) {}
})
