# Deployment Guide

How to ship the trading-terminal frontend to production.

## What you are deploying

A static Vite + React SPA that talks directly to public venue APIs
(Binance, Hyperliquid). **No backend is required for read-only mode.**
Trading methods are stubbed pending Phase 2d signing work.

This means:
- Any static host works (Vercel, Netlify, Cloudflare Pages, S3 + CloudFront).
- No secrets or env vars are required for the first deploy.
- Cost: $0 on free tiers.

---

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node | `>= 20.19` | Vite 8 requires it; older Node fails with `styleText` import error |
| pnpm | `>= 9` | Package manager used by the repo |
| Git | any | Most platforms deploy from a git repo |

```bash
# If you use nvm
nvm install 20.19
nvm use 20.19

# If you don't have pnpm
npm install -g pnpm
```

---

## Build locally first (smoke test)

Always confirm a clean local build before pushing to a hosted platform.

```bash
pnpm install
pnpm build
```

You should see `dist/` populated with `index.html`, `assets/`, etc.
If TypeScript errors appear, fix them locally — they will fail the
hosted build the same way.

Preview the production bundle:

```bash
pnpm preview
# opens http://localhost:4173
```

Click the venue switcher (Binance ↔ Hyperliquid) and confirm:
- Chart re-fetches candles
- DepthBook fills with real Hyperliquid orderbook
- No console errors

If both venues work, you are ready to deploy.

---

## Recommended: Vercel

Cleanest path for a Vite SPA. Auto-detects the framework, zero config.

### One-time setup

1. Push this repo to GitHub.
2. Visit [vercel.com/new](https://vercel.com/new) → import the repo.
3. Vercel auto-detects: Framework = Vite, Build = `pnpm build`,
   Output = `dist`. Confirm and deploy.
4. First deploy completes in ~60 seconds; you get a `*.vercel.app` URL.

### SPA routing

The app uses `react-router-dom`'s `BrowserRouter`, so deep links like
`/trade` and `/portfolio` need to fall back to `index.html`. Vercel
handles this automatically for Vite projects, but if you see a 404 on
a deep link, add a `vercel.json` at the repo root:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Custom domain

Project Settings → Domains → add your domain → follow the DNS
instructions. Vercel issues TLS automatically.

### Auto-deploy on push

Already on by default. Push to `master` deploys to production; PRs
get preview deploys.

---

## Alternative: Netlify

Equivalent to Vercel; pick whichever you already use.

1. Push to GitHub.
2. [app.netlify.com/start](https://app.netlify.com/start) → import.
3. Build command: `pnpm build`, Publish directory: `dist`.
4. Add a `_redirects` file under `public/`:

```
/*    /index.html   200
```

This is the SPA fallback. Without it, deep links 404.

---

## Alternative: Cloudflare Pages

Cheapest for high traffic. Same shape:

1. Pages → Create project → Connect to Git.
2. Build command: `pnpm build`, Build output: `dist`.
3. SPA fallback: in `public/_redirects`:

```
/*    /index.html   200
```

---

## Environment variables

**Phase 1–2c (current):** none required. The app talks to public Binance
and Hyperliquid endpoints directly.

**Phase 2d (when you wire wallet trading):** add these in your hosting
dashboard.

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_HYPERLIQUID_BUILDER_CODE` | Your wallet address; receives ~0.01% rebate per trade routed through your UI | `0x0000000000000000000000000000000000000000` |
| `VITE_HYPERLIQUID_NETWORK` | `mainnet` or `testnet`; controls REST/WS host | `mainnet` |
| `VITE_WAITLIST_ENDPOINT` | URL that accepts `POST { email }` for the landing-page email capture. Works with Formspree, Buttondown, Loops, or your own backend. If unset, emails fall back to localStorage. | `https://formspree.io/f/abcdwxyz` |

`VITE_*` is the Vite convention — anything else is not exposed to the
client. Never put secrets here; **everything prefixed with `VITE_` is
visible in the shipped JS bundle.**

---

## Security headers

Vite SPAs benefit from these response headers. On Vercel, add them via
`vercel.json`. On Netlify, use `public/_headers`. On Cloudflare Pages,
add a Worker.

Recommended baseline:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

CSP is more involved because the app fetches Binance/Hyperliquid REST
and opens WSS to both. A working baseline:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self'
    https://api.binance.com
    wss://stream.binance.com:9443
    https://api.hyperliquid.xyz
    wss://api.hyperliquid.xyz
    https://api.hyperliquid-testnet.xyz
    wss://api.hyperliquid-testnet.xyz;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
```

Wagmi + injected wallets (MetaMask, Rabby) inject scripts into the
page; if your CSP is too strict you will see "Refused to execute
inline script" in the console. Loosen `script-src` to allow wallet
extensions or use a per-request nonce.

---

## Verifying production

After the first deploy succeeds, walk through this checklist:

- [ ] `https://<your-domain>/` loads the trade page
- [ ] Chart shows real candles (not the synthetic random walk)
- [ ] Venue switcher in the header shows Binance and Hyperliquid
- [ ] Switching to Hyperliquid populates the DepthBook with real bids/asks
- [ ] Switching back to Binance shows the "no depth from this venue" hint
- [ ] Deep linking to `/portfolio` works (no 404 — confirms SPA fallback)
- [ ] Browser console shows no CSP violations
- [ ] `pnpm test` passes locally before each deploy

---

## CI/CD (optional)

Vercel and Netlify both include this automatically. If you self-host
or want explicit control, here is a minimal GitHub Actions workflow at
`.github/workflows/build.yml`:

```yaml
name: build
on:
  push:
    branches: [master]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20.19'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
```

---

## Rollback

If a deploy breaks production:

- **Vercel:** Project → Deployments → previous green deploy → "Promote to production"
- **Netlify:** Deploys tab → previous → "Publish deploy"
- **Cloudflare Pages:** Deployments → previous → "Rollback"

All three preserve immutable deploy artifacts, so rollback is one click.

---

## Cost notes

For a small audience (<10k MAU, <100GB/month bandwidth), all three
recommended platforms are free. Beyond that:

- **Vercel** Pro: $20/seat/month for analytics + higher limits
- **Netlify** Pro: $19/seat/month
- **Cloudflare Pages** stays free for unlimited bandwidth; you pay
  ~$5/month if you want Workers for SSR or middleware

Binance and Hyperliquid public APIs are free with rate limits well
above what a UI consumes. Your only billing risk is bandwidth,
which a static SPA keeps cheap.

---

## When you wire trading (Phase 2d)

The deploy story does not change — still a static SPA. The wallet
signs locally; nothing leaves the user's browser unsigned.

What you should add:

1. `VITE_HYPERLIQUID_BUILDER_CODE` env var pointing at your address.
2. A settings page where users opt into "enable wallet trading"
   (so the popup-per-order flow is consent-driven, not surprising).
3. CSP `connect-src` already includes Hyperliquid endpoints — no
   change needed.
4. Validate against `https://api.hyperliquid-testnet.xyz` first;
   mainnet only after a successful end-to-end signed order.

No server is needed for Hyperliquid because orders are signed by the
user's wallet. If you later add Binance authenticated trading, that
**does** require a server-side key proxy — a separate deploy concern.
