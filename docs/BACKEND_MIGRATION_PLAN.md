# Backend Migration Plan

> **Read this before adding any server-side state.** TradingDek ships
> client-only by design — every store is localStorage-backed, every
> bot runs in the browser, every venue call is direct from the user's
> machine. The "no backend, audit it yourself" stance is part of the
> product's positioning.
>
> When the time comes to introduce a backend, this plan describes what
> to migrate, what to keep client-side, and the order of operations
> that minimises trust regression.

---

## 1 · When to migrate (triggers)

Do not add a backend before at least one of these has fired:

- **Monetization.** The day you decide to charge for anything,
  subscriptions need a server. Stripe webhooks → entitlements lookup →
  feature gates.
- **Cross-device demand.** Real users repeatedly asking "I added a bot
  on desktop, why doesn't my phone see it?" — not as a hypothetical
  worry, but as a logged ticket.
- **Aggregate proof page.** When `/proof` needs to show
  *TradingDek-wide* hit-rate (not just the visitor's own ledger),
  there's no client-only path — someone has to compute the merge.
- **Self-serve marketplace publishing.** Once "PR to library.ts" can't
  keep up with submission volume, you need a publish form + review
  queue.
- **Email / push notifications for offline alerts.** Browser
  notifications only fire when the tab is open. Real off-screen alerts
  need a server.

If none of those have fired, **stay client-only**. Every server you add
weakens the trust narrative and pulls ops time from product time.

---

## 2 · Stack recommendation (in priority order)

| Stack | When to pick |
|---|---|
| **Supabase** | Default choice. Mature, generous free tier, real auth, RLS, realtime, edge functions. Best fit for "I want a backend, not to manage a backend." |
| **PocketBase** | Pick if you want a single binary you can self-host on Fly/Railway for $5/mo, and don't need horizontal scale. Good for early traction, painful past 10k MAU. |
| **Cloudflare Workers + D1** | Pick if global latency is critical (signal sub-services, edge alerts). More bespoke; less batteries-included. |
| **Custom Node + Postgres** | Only if existing team owns the runtime. No reason to start from scratch. |

For everything below, assume **Supabase** unless your reasons override
the default.

---

## 3 · What moves vs what stays client-side

### Stays client-side (do not migrate)

These are *load-bearing* trust artifacts. Moving them to a server
breaks the "audit it yourself" story.

- **`useBotStore`** — bot configs and the trade ledger. Bots execute
  in the browser; their PnL is the user's PnL. Server view is
  derivative; ground truth stays local.
- **`useSignalPerformanceStore`** — per-user hit-rate. The page at
  `/proof` is "your view of the signals." Aggregating across users is
  a separate (server-side) feature, not a replacement.
- **`credentialsVault`** — encrypted Binance API keys. Never goes near
  a server. AES-GCM + PBKDF2 client-side, full stop.
- **`vaultSessionStore`** — derived from the vault; in-memory only.
- **Chart layout, watchlist, signal thresholds, signal pinned/dismissed**
  — pure UX state. Cross-device sync is a feature, not a re-platform;
  see §3 "Optional middle tier — settings sync".

### Moves to server (the new substrate)

- **Authors / accounts.** Real identity behind `@handle`. Today
  handles are self-asserted; on the server they're owned by an account
  with at least an email + sign-in.
- **Strategy library.** Today: static `library.ts` + PR for community
  entries. On server: `strategies` table + a `published_at` /
  `reviewed_at` lifecycle. The static file becomes a seed for "team
  curated" entries.
- **Follow graph.** `useFollowStore` becomes a server table when
  cross-device matters. Until then, the client store is the source
  of truth and the server-side mirror is best-effort.
- **Aggregate proof.** A worker computes hit-rate across all
  participating browsers (opted in). The per-user hit-rate stays local;
  this is a wider-net view.
- **Notifications hub.** `notifications` table + a worker that sends
  email/push when subscribed events fire (high-confidence confluence,
  cap breach, daily digest).
- **Subscriptions / entitlements.** Stripe customer ↔ tier mapping.

### Optional middle tier — settings sync

A *minimal* sync: encrypt a single user-state blob client-side (with
the same passphrase pattern the vault uses) and POST to a `kv` table.
Server stores ciphertext only, can't read anything. Restores the
"my desktop and phone match" UX without giving up the trust story.

If you do this, it's the *first* thing to migrate (lowest risk,
highest user value). Stores in scope: bots, follows, watchlist,
settings, signal thresholds, performance ledger.

---

## 4 · Schema sketch (Supabase / Postgres)

```sql
-- Identity
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  handle      text unique not null check (handle ~ '^@[a-z0-9_]{2,30}$'),
  display_name text,
  bio         text,
  created_at  timestamptz default now()
);

-- Marketplace
create type strategy_kind as enum ('curated', 'community');
create type review_state  as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table strategies (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  author_id    uuid references profiles(id) on delete set null,
  name         text not null,
  summary      text not null,
  tags         text[] not null default '{}',
  bot_manifest jsonb not null,           -- the PortableBot v:1 JSON
  kind         strategy_kind not null default 'community',
  review       review_state not null default 'pending',
  perf_winrate numeric,                  -- author-claimed at submission
  perf_sample  integer,
  perf_since   date,
  published_at timestamptz,
  created_at   timestamptz default now()
);
create index on strategies (kind, review, published_at desc);
create index on strategies using gin (tags);

-- Follow graph
create table follows (
  follower_id uuid references profiles(id) on delete cascade,
  -- follow either an author OR a strategy:
  author_id   uuid references profiles(id) on delete cascade,
  strategy_id uuid references strategies(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (follower_id, author_id, strategy_id)
);

-- Optional: encrypted client-state blob (for cross-device sync)
create table kv_blobs (
  user_id    uuid references auth.users primary key,
  key        text not null,
  ciphertext bytea not null,             -- AES-GCM, key derived from user passphrase
  iv         bytea not null,
  updated_at timestamptz default now()
);

-- Optional: aggregate proof (opt-in telemetry)
create table signal_outcomes (
  id          bigserial primary key,
  source      text not null,
  market_id   text not null,
  direction   text not null,             -- 'long' | 'short'
  entry_price numeric not null,
  close_price numeric not null,
  triggered_at timestamptz not null,
  resolved_at  timestamptz not null,
  hit         boolean not null,
  -- denominator of users contributing this outcome (always 1 with current schema;
  -- the table is append-only and dedup is left to the materialised view).
  client_id   uuid                         -- anonymised, rotates monthly
);
create index on signal_outcomes (source, resolved_at desc);
```

Row-level security is critical:

- `profiles`: select-by-anyone, update-only-by-owner.
- `strategies`: select-by-anyone-where-review='approved'-or-author=auth.uid; insert-by-authed; update-by-author-while-pending.
- `follows`: row owner is `follower_id`; standard auth.uid() = follower_id policy.
- `kv_blobs`: row owner only; never select for another user.
- `signal_outcomes`: insert-only, no public select (worker queries materialised
  views built from this).

---

## 5 · Migration order (minimise trust regression)

1. **Settings sync (encrypted KV blob)** — Lowest risk, highest UX
   win. Preserves "no plaintext on server." Stores in scope: bots,
   follows, watchlist, settings, signal thresholds, performance ledger.
   Document the encryption recipe in the same place we document the
   vault.
2. **Auth + profiles** — Add Supabase auth (email magic-link is fine).
   Migrate `@handle` from self-asserted in JSON to a real owned record.
   Existing `library.ts` entries map to profiles via a one-time seed.
3. **Strategy publishing flow** — UI form on `/library` that POSTs a
   `PortableBot` manifest to `strategies` with `review: pending`. Team
   approves via Supabase admin. Static `library.ts` continues to seed
   the "curated" entries until a CMS workflow is desirable.
4. **Follow graph mirror** — Sync the existing `followStore` to the
   server table. Client remains source of truth; server is best-effort
   mirror until cross-device demand says otherwise.
5. **Aggregate proof (opt-in)** — Add a "Contribute to public hit-rate"
   toggle in `/profile`. When on, resolved signal outcomes anonymise
   and POST. Server materialised view powers a new `/proof/aggregate`
   page. Per-user `/proof` stays exactly as is.
6. **Notifications hub** — `notifications` table + a worker that
   subscribes to channels (e.g. "new strategy from @foo", "cap
   breached", "high-confidence BTC long"). Email + web push.
7. **Subscriptions / paid tier** — Stripe customer ↔ Supabase user.
   Entitlements table. Feature flags read entitlement on load.

Each step ships behind a feature flag (`VITE_BACKEND_FEATURES=`) so
you can roll back any single migration without redeploying clients.

---

## 6 · What we explicitly are NOT building

To preserve the moat:

- **Server-side bot execution.** The "bots run in your browser" story
  is the answer to "why should I trust this thing." Hosted bots are a
  separate product (and not a TradingDek product) — different trust
  model, different ops shape, different audience.
- **Custodial wallets / pooled funds.** Same answer.
- **Closed-source signal compute.** Signals are computed in
  `src/signals/compute.ts` so anyone can audit the logic. Moving them
  server-side hides the logic and breaks `/proof`.
- **Centralised order routing.** We deep-link out to venues; we don't
  proxy orders.

---

## 7 · Triggers checklist before approving a migration step

Before any step in §5 is greenlit, the proposing PR must answer:

- [ ] Which trigger from §1 has fired? (Quote the user feedback or the
      decision.)
- [ ] What does the client experience look like if the server is down?
      (Graceful degradation or hard failure?)
- [ ] What new attack surface does this introduce, and what's the
      mitigation? (Rate limit, RLS audit, CSP update.)
- [ ] What user-visible message reflects the new trust model? (e.g.
      "we now sync your settings — here's what that means")
- [ ] How does the user opt OUT and remain client-only?

The answers go in the PR description and become permanent context for
future maintainers.
