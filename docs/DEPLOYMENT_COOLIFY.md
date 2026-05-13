# Deploying TradingDek to Coolify (Hetzner) — click guide

This is the **point-and-click** path. You open a terminal once at the
start to install Coolify; everything after that is in the Coolify web UI.

> If you ever want to skip Coolify entirely, see `docs/DEPLOYMENT_BACKEND.md`
> for the bare `docker compose` + Caddy path.

---

## What you'll end up with

- `https://tradingdek.com` → the SPA (React, served by nginx)
- `https://api.tradingdek.com` → the backend (PocketBase + SIWE + NOWPayments webhook)
- Both with auto-renewing Let's Encrypt TLS, managed by Coolify
- One Hetzner VM (~€6/month), one Coolify project containing one
  "Docker Compose" resource — both services live there together

---

## 0 · Prerequisites checklist

You need:
- [ ] **A Hetzner Cloud account** (signup is 5 minutes, accepts card or PayPal).
- [ ] **A domain** — you said you'll buy `tradingdek.com`. Namecheap or
      Cloudflare are fine. Cloudflare's DNS panel is slightly nicer.
- [ ] **A GitHub account** with the TradingDek repo. Coolify pulls from
      a fork or the source repo — either works.
- [ ] **A NOWPayments account** (later — only needed to actually take
      money). You can skip this for the first deploy and turn payments
      on afterwards.

You do NOT need:
- ❌ A business entity
- ❌ Email/SMTP credentials
- ❌ Stripe
- ❌ Terminal experience beyond copy-paste one command at step 2

---

## 1 · Create the Hetzner VM (5 min, browser only)

1. Log into the Hetzner Cloud panel.
2. Click **New Server**.
3. Choose:
   - **Location:** any (Falkenstein is the standard).
   - **Image:** Ubuntu 24.04.
   - **Type:** **CX21** (€6/mo, 2 vCPU, 4 GB RAM). The cheaper CX11 is
     too tight for Coolify + the two containers; spend the extra €2.
   - **SSH key:** create one via the Hetzner panel button.
4. Click **Create & Buy now**.
5. Note the IPv4 address — you'll need it twice.

---

## 2 · Install Coolify on the VM (one terminal moment)

This is the only step that uses a terminal. After it's done you'll
never touch the command line again.

1. From your laptop, open Terminal.app (Mac) — or just click the **>_**
   icon in the Hetzner panel for an in-browser console.
2. SSH into the VM:
   ```
   ssh root@<your-VM-ip>
   ```
3. Paste this single line — Coolify's official installer:
   ```
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
   ```
4. Wait ~3 minutes. When it finishes it prints a URL like
   `http://<your-VM-ip>:8000`.
5. Open that URL in your browser. Set your admin email + password.

> If anything goes wrong, the installer's output tells you exactly
> what. Most common issue: forgetting `sudo`. Re-run the same command.

---

## 3 · Point your domain at the VM (5 min, DNS panel)

In your DNS provider (Cloudflare/Namecheap):

| Type | Host | Value | Proxy |
| --- | --- | --- | --- |
| A | `@` (or `tradingdek.com`) | `<your-VM-ip>` | DNS only — no Cloudflare proxy yet |
| A | `api` (or `api.tradingdek.com`) | `<your-VM-ip>` | DNS only |

Wait 5-10 minutes for propagation. Check with
[dnschecker.org](https://dnschecker.org) — both records should resolve
to the VM's IP from most regions before continuing.

> If you use Cloudflare, **leave the orange proxy cloud OFF for now**.
> Coolify needs to talk directly to Let's Encrypt during TLS issuance.
> You can enable the Cloudflare proxy later once the cert is in place.

---

## 4 · Connect GitHub to Coolify (3 min)

1. In the Coolify UI, click **Sources → New** in the left sidebar.
2. Choose **GitHub App**. Click **Install GitHub App** — it pops a
   GitHub auth window. Grant access to the `web3-demo` repo.
3. Coolify shows a "✅ Source connected" banner.

You only do this once.

---

## 5 · Create the project + resource (5 min)

1. Click **Projects → New** in the left sidebar.
2. Name it `tradingdek`. Click **Create**.
3. Inside the project, click **New Resource → Docker Compose**.
4. Choose the GitHub source you connected in step 4.
5. **Repository:** `bonguynvan/web3-demo` (or your fork).
6. **Branch:** `master`.
7. **Docker Compose path:** `docker-compose.yml` (default — already
   sits at the repo root, points at both services).
8. Click **Save**.

Coolify shows you the parsed services: `spa` and `pocketbase`. Don't
deploy yet — set env vars first.

---

## 6 · Set environment variables (5 min)

In the resource's **Environment Variables** tab, paste these. Adjust
domains to whatever you own.

```
# ─── Backend secrets ──────────────────────────────────────────────────
# NOWPAY_IPN_SECRET is required for webhook signature verification —
# you can leave it empty for the first deploy and add it after the
# NOWPayments account.
NOWPAY_IPN_SECRET=
PB_ADMIN_EMAIL=you@example.com
PB_ADMIN_PASSWORD=<paste a long random string here>
PB_ENCRYPTION_KEY=<paste 32 random chars here>

# ─── SPA build-time vars ──────────────────────────────────────────────
# Baked into the bundle by the SPA Dockerfile. Empty = feature off.
VITE_API_BASE=https://api.tradingdek.com
VITE_FEEDBACK_EMAIL=you@example.com

# Optional — fill once you have the accounts:
VITE_NOWPAY_PUBLIC_KEY=
VITE_PLAUSIBLE_DOMAIN=
VITE_BINANCE_REST_BASE=https://api.tradingdek.com/api/proxy/binance
VITE_HYPERLIQUID_BUILDER_CODE=
```

Tips:
- **PB_ADMIN_PASSWORD / PB_ENCRYPTION_KEY:** use any password
  generator for "32 character random string". Save them in a password
  manager.
- **VITE_BINANCE_REST_BASE:** setting this routes Binance market-data
  through your backend proxy (zero CORS issues, stable IP). Leave it
  empty if you want the SPA to talk directly to Binance.

---

## 7 · Assign domains to each service (3 min)

Still inside the resource:

1. Click the **spa** service tile.
2. **Domains** tab → **Add Domain** → `tradingdek.com`. Coolify
   auto-creates a `www.` redirect if you want.
3. **Port to expose:** `80`. Coolify auto-detects from the Dockerfile;
   confirm.
4. Back to the resource, click the **pocketbase** service tile.
5. **Domains** tab → **Add Domain** → `api.tradingdek.com`.
6. **Port to expose:** `8090`.

Coolify will issue Let's Encrypt certs for both during the first
deploy. No config files to write.

---

## 8 · Deploy (1 click)

1. Top-right of the resource, click **Deploy**.
2. The deploy log streams live. First build takes ~4-6 minutes (SPA
   pnpm install + vite build, plus the Go binary compile). After
   that, incremental deploys take ~90 seconds.
3. When both services show 🟢 **Running**, open
   `https://tradingdek.com` — landing page should appear.
4. Open `https://api.tradingdek.com/_/` — PocketBase admin login. Use
   the `PB_ADMIN_EMAIL` + `PB_ADMIN_PASSWORD` from step 6.

---

## 9 · NOWPayments account (10 min, when ready to take money)

You can ship without this; sign-in + 14-day trial already work
without payments.

1. Sign up at https://nowpayments.io. Pick **Individual** (not Business).
2. **Store Settings:**
   - Add your USDT-TRC20 wallet address (Binance Spot Wallet → Deposit
     → USDT → TRC20 network → copy address).
   - Set **IPN callback URL** to `https://api.tradingdek.com/api/webhooks/nowpay`.
3. **API & Authorization → IPN Secret:** generate one. Copy.
4. **API & Authorization → API Key:** copy the **public** key.
5. Back in Coolify, update env vars:
   - `NOWPAY_IPN_SECRET` = IPN secret from step 3
   - `VITE_NOWPAY_PUBLIC_KEY` = public API key from step 4
6. Click **Redeploy** (top-right).

The upgrade modal in the SPA now creates real invoices.

---

## 10 · Auto-deploy on git push (already wired)

The Coolify GitHub source listens for pushes to `master`. Every push
auto-rebuilds and redeploys. You can disable this in the resource's
**Webhooks** tab if you'd rather deploy manually.

---

## Common gotchas

- **"Let's Encrypt rate limit"**: if you redeployed 5+ times before
  DNS propagated, LE locks you out for an hour. Wait, then redeploy.
- **"docker: build failed"**: usually a missing env var required at
  SPA build time. Check the build log for `Missing required env var:`.
  Add it in step 6 and redeploy.
- **The SPA loads but auth/upgrade buttons don't appear**: `VITE_API_BASE`
  is unset. Add it, redeploy.
- **NOWPayments webhook 401**: `NOWPAY_IPN_SECRET` mismatch between
  Coolify env and the NOWPayments dashboard. Re-paste, redeploy.

---

## What it costs you

| Item | Monthly |
| --- | --- |
| Hetzner CX21 VM | €6 |
| `tradingdek.com` domain | ~$1 averaged ($12/year) |
| Coolify | €0 (self-hosted, open source) |
| Let's Encrypt TLS | €0 |
| NOWPayments | 0.5–1% of revenue, no fixed fee |

About **€7/month total**, plus a small cut of revenue. No business
entity, no Stripe, no card on file.

---

## Updating

Every push to GitHub auto-deploys in ~90 seconds. Coolify streams the
build log. You'll spend basically all your time in the editor.
