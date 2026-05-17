# Bot framework

Complete guide to TradingDek's bot system. Last updated against the
post-pro-audit codebase.

## Mental model

A **bot** watches the signal feed and opens paper-trading positions
when a signal matches its filters. After a hold window (or earlier
via risk exits) the position closes and the realized PnL goes into
the ledger.

Bots in `mode: 'live'` route real signed orders to a connected
venue. This requires the credentials vault to be unlocked and the
relevant adapter authenticated. **Default is `paper`.**

---

## Risk profiles

Every bot carries a `riskProfile` archetype that drives defaults:

| Profile | Sizing | Stop loss | Take profit | Hold | Max/day | Best for |
|---|---|---|---|---|---|---|
| 🛡️ **Conservative** | $50 / 0.5% risk | 1% | 2% | 4h | 3 | "Secure profits" — slow, tight stops, capital preservation |
| ⚖️ **Balanced** | $100 / 0.5% risk | 2% | 4% | 1h | 10 | Default. Mid-range stops, sensible baseline |
| ⚡ **Aggressive** | $200 / 1% risk | 3% | 6% | 15m | 30 | "Quick money" — wider targets, higher variance |
| ⚙️ Custom | Manual | Manual | Manual | Manual | Manual | Auto-flips here once the user tunes any field |

Profiles are also visible as colored badges on bot cards.

---

## Position sizing

Two modes:

### Fixed USD (default)
`positionSizeUsd` is the notional per trade. Same dollar amount
regardless of bankroll. Beginner-friendly.

### Risk-percent (pro)
```
notional = (accountEquityUsd × riskPctPerTrade%) / stopLossPct%
```
A stop-out always loses exactly `riskPctPerTrade%` of equity,
regardless of how volatile the market is. This is how pros size.

Set `accountEquityUsd` once via Profile → Risk caps or the position
calculator widget (`/calc`); every risk-% bot reads from there.

---

## Risk exits (priority order)

Every tick, the engine checks each open trade in this order. The
first condition to fire wins.

1. **Stop loss** — pnlPct ≤ -`stopLossPct`. Hard floor.
   - When `slMovedToBreakEven` is true, the floor moves to 0 instead.
2. **Take profit** — pnlPct ≥ `tp2Pct` (or `takeProfitPct` if tp2 unset).
3. **Trailing stop** — pnlPct ≤ peakPnlPct − `trailingStopPct`.
   Only arms after a winning excursion.
4. **Break-even arming** (state change, not exit) — if pnlPct reaches
   `breakEvenAtPct`, the SL floor is moved to entry. The trade is
   now "risk-free" — a pullback to entry closes flat.
5. **Hold expired** — `now ≥ closeAt` (entry + `holdMinutes`).
6. **Reversal** — an opposing confluence signal ≥0.7 confidence on
   the same market, after a 2-min min-hold to avoid flip-flops.

### Multi-target take-profit (TP1 / TP2)

When `tp1Pct` is set:
1. At pnlPct ≥ `tp1Pct`, partial-close `tp1ClosePct%` of the
   position (default 50%) and accumulate the PnL into
   `tp1ClosedPnlUsd`. The runner continues with the reduced size.
2. The remainder rides until SL / trailing / hold-expired / `tp2Pct`.

Final `pnlUsd` = `tp1ClosedPnlUsd` + remainder PnL.

`exitReason: 'tp1_partial'` tags partial closes; the runner gets
the actual final exit reason.

---

## Portfolio-level guardrails

Configured in **Profile → Risk caps** (`riskStore`). All three caps
are independent; any single breach pauses every bot.

| Cap | Behavior |
|---|---|
| `dailyPnlCapUsd` | Realized PnL in the last 24h. If it drops below `-X`, pause. |
| `maxDrawdownUsd` | Peak realized minus current realized cumulative PnL. If `≥ X`, pause. |
| `maxExposureUsd` | Sum of open trade notional. Pre-checked before opening — over-cap trades simply skip. |

### Soft warning + auto-pause tiers

- **80% utilization** — `useRiskMonitor` fires a `toast.warning` once
  per cap per 30 min, throttled via `lastWarnedAt`. Heads-up before
  bots get paused.
- **100% utilization** — full breach. `setAllEnabled(false)`,
  `toast.error`, breach reason stored.
- **Per-bot performance degradation** — separate from caps:
  `useAutoPauseDegradation` pauses a single bot when its recent
  15 closed trades hit ≤40% win-rate AND negative PnL. Dedup via
  `tc-autopause-v1` so re-enabling clears the flag.

### Total open risk

Surfaced at the top of `/risk`. For every open trade:
```
risk_i = positionUsd_i × (stopLossPct_i / 100)
```
Sum across all open trades. Unstopped trades count at full
notional with an amber "X unstopped" warning.

---

## Bot lineage

When a bot is **forked** (the GitFork button on a bot card), the
new bot stores:
- `parentId` — the source bot's id
- `parentKind: 'bot'`
- `forkedAt` — epoch ms

Forks default to **paper + disabled** (safer floor). The bot card
shows a "Forked from X" subtitle. If the parent is renamed, the
subtitle resolves live; if deleted, it disappears.

---

## Shadow bots

Phantom paper variants of a real bot with parameter overrides.
Click the Copy icon on a bot card to spawn a "Tight stop" shadow
with `stopLossPct` halved. The shadow runs in parallel using
`useShadowEngine` — same signal feed, same markets, different exit
parameters.

Shadows always paper, never touch venue APIs. Trades land in
`shadowStore` (separate ledger, capped at 500). The bot card shows
aggregate "Phantom PnL" and the delta vs the real bot, so the
counterfactual is visible at a glance.

When a real bot is deleted, `botStore.removeBot` calls
`shadowStore.removeShadowsForParent` to clean up orphans.

---

## Analytics

| Surface | What it shows |
|---|---|
| **/attribution** | Slice closed-trade PnL by source / market / hour / direction / exit reason. Sortable; win-rate dashes when count < 3. |
| **Bot card exit mix** | Per-bot distribution of close reasons — TP-heavy = real edge, hold-expired-heavy = no signal alpha. |
| **/bots/leaderboard** | Ranked across all bots by PnL, win-rate, or trade count. Per-row equity sparklines. |
| **Walk-forward (modal on /bots)** | SL × TP parameter sweep with train/test split. Generalization ratio identifies overfit. |
| **/journal** | Per-trade annotations, tags, 0-5 rating. Optional AI auto-post-mortem (Pro) writes a 2-line analysis on every close. |

---

## AI features (Pro-gated)

All share the same 30/hour rate limit and require an active Pro
entitlement plus `ANTHROPIC_API_KEY` set server-side.

| Endpoint | Trigger | Output |
|---|---|---|
| `POST /api/ai/explain` | Click "Why?" on a signal card | 2-sentence explanation + risk |
| `POST /api/ai/strategy` | `/strategy-assistant` page | Suggested bot config from free-form hypothesis |
| `POST /api/ai/postmortem` | Auto on trade close (opt-in toggle on `/journal`) | 2-sentence retrospective written to the journal |
| `POST /api/ai/followup` | Chat under an explanation | Multi-turn Q&A |

---

## Hyperliquid signed trading

When `VITE_HYPERLIQUID_NETWORK` is `mainnet` or `testnet`, the
agent-wallet flow lets bots place real orders without a wallet
popup per trade:

1. **Generate agent** (Profile → Hyperliquid agent wallet) — creates
   a fresh private key stored encrypted in the credentials vault.
2. **Approve** — one EIP-712 sign via your real wallet. From now on
   the agent signs individual orders silently.
3. **Unlock** — after any page reload, enter the vault passphrase
   to load the agent key back into memory (`agentKeyCacheStore`).
   Bots and the place-order modal show "vault locked" until unlocked.

The agent can place / cancel orders but **cannot withdraw funds**.
Forget the agent any time to revoke locally; revoke on chain via
the Hyperliquid UI if you want a clean audit trail.

---

## Storage keys

All local-only. No backend writes for bot data.

| Key | Contents |
|---|---|
| `tc-bots-v1` | Bot configs + trade ledger (capped 500) |
| `tc-shadows-v1` | Shadow bots + shadow trade ledger (capped 500) |
| `tc-risk-v1` | Risk caps + breach + `lastWarnedAt` + `accountEquityUsd` |
| `tc-journal-v1` | Per-trade annotations + `autoPostMortemEnabled` |
| `tc-autopause-v1` | Set of bot ids already auto-paused (dedup) |
| `tc-bot-drift-v1` | Set of bot ids already drift-toasted (dedup) |
| `tc-hl-agent-v2` | HL agent metadata (no private key — that's in the vault) |
| `tc-vault-v1` | AES-GCM sealed credentials vault (CEX keys + HL agent key) |

---

## Schema cheat sheet

`BotConfig` fields you'll actually tune:
```ts
{
  // Filters
  allowedSources: ['confluence' | 'funding' | 'crossover' | ...]
  allowedMarkets: ['BTC-PERP', ...]  // empty = any
  minConfidence: 0..1

  // Sizing
  sizingMode: 'fixed_usd' | 'risk_pct'
  positionSizeUsd: number
  riskPctPerTrade?: number   // 0.25 to 5 typical

  // Risk exits (all percent, 0 = off)
  stopLossPct?: number
  takeProfitPct?: number     // single-TP mode
  trailingStopPct?: number
  breakEvenAtPct?: number
  tp1Pct?: number            // multi-TP mode
  tp1ClosePct?: number       // % to close at TP1, default 50
  tp2Pct?: number

  // Lifecycle
  holdMinutes: number
  maxTradesPerDay: number
  mode: 'paper' | 'live'
  enabled: boolean

  // Metadata
  riskProfile?: 'conservative' | 'balanced' | 'aggressive' | 'custom'
  parentId?: string
  parentKind?: 'bot' | 'template'
}
```

---

## When something goes wrong

| Symptom | Likely cause |
|---|---|
| Bot opens trade but PnL never resolves | Mark price not flowing; check the venue WS connection |
| Bot doesn't fire on a matching signal | Confidence below `minConfidence`, or market not in `allowedMarkets`, or `maxTradesPerDay` cap hit |
| Live trade rejected | Vault locked, adapter not authenticated, or HL agent not approved on the current network |
| Auto-paused unexpectedly | Recent 15-trade win-rate ≤40% with negative PnL. Tune or fork before re-enabling |
| Risk cap breach not clearing | Cap value was lowered below current drawdown/exposure — raise it or wait for state to drift back |

---

## Related docs

- [DEPLOYMENT_COOLIFY.md](DEPLOYMENT_COOLIFY.md) — recommended one-VPS deploy
- [DEPLOYMENT_BACKEND.md](DEPLOYMENT_BACKEND.md) — bare `docker compose` + Caddy
- [DEPLOYMENT.md](DEPLOYMENT.md) — static SPA hosts (Vercel/Netlify/CF Pages)
- [PUBLISHING_STRATEGIES.md](PUBLISHING_STRATEGIES.md) — contributing a bot to the curated library
