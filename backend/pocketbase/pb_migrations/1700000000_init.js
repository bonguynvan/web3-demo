/// <reference path="../pb_data/types.d.ts" />
//
// Initial schema for TradingDek backend.
//
// - Extends the built-in `users` (auth) collection with `wallet_address`.
// - Creates `entitlements`, `invoices`, `siwe_nonces`.
// - Rules: each user can read only their own entitlements + invoices.
//   Writes are server-only (custom Go routes + NOWPayments webhook),
//   never directly from the SPA.
//
migrate((app) => {
  // ─── Extend users (auth) with wallet_address ─────────────────
  const users = app.findCollectionByNameOrId('users')
  users.fields.add(new Field({
    name: 'wallet_address',
    type: 'text',
    required: false,
    presentable: true,
    unique: true,
  }))
  app.save(users)

  // ─── entitlements ────────────────────────────────────────────
  const ent = new Collection({
    type: 'base',
    name: 'entitlements',
    fields: [
      { name: 'user', type: 'relation', collectionId: users.id, cascadeDelete: true, maxSelect: 1, required: true },
      { name: 'pro_days_remaining', type: 'number', onlyInt: true, min: 0 },
      { name: 'paygo_balance_usd', type: 'number', min: 0 },
      { name: 'pro_active', type: 'bool' },
      { name: 'trial_expires_at', type: 'date' },
      { name: 'last_decrement_at', type: 'date' },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_entitlements_user` ON `entitlements` (`user`)',
    ],
    listRule: '@request.auth.id = user.id',
    viewRule: '@request.auth.id = user.id',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  app.save(ent)

  // ─── invoices ────────────────────────────────────────────────
  const inv = new Collection({
    type: 'base',
    name: 'invoices',
    fields: [
      { name: 'user', type: 'relation', collectionId: users.id, cascadeDelete: true, maxSelect: 1, required: true },
      { name: 'nowpay_invoice_id', type: 'text', required: true },
      { name: 'amount_usd', type: 'number', min: 0 },
      { name: 'kind', type: 'select', values: ['paygo_topup', 'sub_30', 'sub_180', 'sub_365'], required: true, maxSelect: 1 },
      { name: 'status', type: 'select', values: ['pending', 'paid', 'expired'], required: true, maxSelect: 1 },
      { name: 'pay_currency', type: 'text' },
      { name: 'paid_at', type: 'date' },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_invoices_nowpay_id` ON `invoices` (`nowpay_invoice_id`)',
      'CREATE INDEX `idx_invoices_user` ON `invoices` (`user`)',
    ],
    listRule: '@request.auth.id = user.id',
    viewRule: '@request.auth.id = user.id',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  app.save(inv)

  // ─── siwe_nonces (server-only, no SPA access) ────────────────
  const nonces = new Collection({
    type: 'base',
    name: 'siwe_nonces',
    fields: [
      { name: 'nonce', type: 'text', required: true },
      { name: 'wallet_address', type: 'text', required: true },
      { name: 'created', type: 'text', required: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_siwe_nonce` ON `siwe_nonces` (`nonce`)',
      'CREATE INDEX `idx_siwe_addr` ON `siwe_nonces` (`wallet_address`)',
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  app.save(nonces)
}, (app) => {
  for (const name of ['siwe_nonces', 'invoices', 'entitlements']) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (_) {}
  }
  const users = app.findCollectionByNameOrId('users')
  const fld = users.fields.getByName('wallet_address')
  if (fld) {
    users.fields.removeById(fld.id)
    app.save(users)
  }
})
