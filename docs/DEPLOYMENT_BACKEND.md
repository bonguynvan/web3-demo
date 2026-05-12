# TradingDek backend — Hetzner deploy

Single-container PocketBase + custom Go handlers. ~30 MB RAM, single
SQLite file, NOWPayments-only crypto rail. Wallet-only auth (SIWE-lite).

## What ships

| Path                          | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `GET  /api/siwe/nonce`        | Issue one-time nonce for wallet sign-in              |
| `POST /api/siwe/verify`       | Verify signature → return auth token + create user   |
| `POST /api/webhooks/nowpay`   | NOWPayments IPN — credits entitlement on confirmed   |
| `GET  /api/me`                | Caller's entitlement (Bearer token)                  |
| `/_/` (admin UI)              | PocketBase admin                                     |
| `/api/collections/*`          | PB CRUD (rules restrict to own rows)                 |

## Prerequisites

1. **Hetzner Cloud VM** — CX11 (€4/mo) is enough. Ubuntu 24.04 LTS.
2. **Domain pointed at the VM** — e.g., `A api.tradingdek.com → <IP>`.
3. **Docker + Caddy** installed:
   ```bash
   apt update && apt install -y docker.io docker-compose-v2 caddy
   systemctl enable --now docker caddy
   ```
4. **NOWPayments account** — `https://nowpayments.io`. Create a store,
   grab the **API key** and the **IPN secret**. No KYC for typical volume.

## First boot

```bash
git clone https://github.com/<you>/tradingdek.git /opt/tradingdek
cd /opt/tradingdek

cat > .env <<'EOF'
NOWPAY_IPN_SECRET=<paste the IPN secret here>
PB_ADMIN_EMAIL=you@example.com
PB_ADMIN_PASSWORD=<long random string>
PB_ENCRYPTION_KEY=<32 random chars>
EOF
chmod 600 .env

docker compose up -d --build
docker compose logs -f pocketbase
# wait for "Server started at http://0.0.0.0:8090"
```

Caddy:

```bash
cp Caddyfile.example /etc/caddy/Caddyfile
sed -i 's/api.tradingdek.com/<your domain>/g' /etc/caddy/Caddyfile
systemctl reload caddy
```

Visit `https://<your domain>/_/` → log in with the admin creds → confirm
the four collections (`users`, `entitlements`, `invoices`, `siwe_nonces`)
are present.

## NOWPayments configuration

In the NOWPayments dashboard:

- **IPN callback URL** → `https://<your domain>/api/webhooks/nowpay`
- **Success / cancel URLs** → `https://<your SPA>/billing?ok=1` / `?cancel=1`

The SPA creates invoices via NOWPayments' REST API. The webhook is the
only mutator that touches user balance.

Invoice `order_id` MUST be `<userId>:<kind>` where kind is one of:
`paygo_topup`, `sub_30`, `sub_180`, `sub_365`. The webhook handler
splits on `:` to route the credit.

## Pricing model

| Tier              | Mechanic                                                |
| ----------------- | ------------------------------------------------------- |
| Trial (14 days)   | Granted on first SIWE sign-in. No payment.              |
| Pay-as-you-go     | Top up USD balance with crypto. $0.10/day while Pro on. |
| Subscription      | $5 = 30 Pro-days, $25 = 180 days, $50 = 365 days.       |

Days **stack** — pay whenever; no auto-renew.

## Operations

- **Backup:** snapshot the volume nightly.
  ```bash
  docker run --rm -v tradingdek_pb_data:/d -v $PWD:/b alpine \
    tar czf /b/pb-$(date +%F).tgz -C /d .
  ```
- **Logs:** `docker compose logs -f pocketbase` + `/var/log/caddy/`.
- **Update:** `git pull && docker compose up -d --build`.
- **Admin reset:** through `/_/` or
  `docker exec -it tradingdek-pb /app/pocketbase superuser create …`.

## Disaster recovery

Everything is in one SQLite file at
`/var/lib/docker/volumes/tradingdek_pb_data/_data/data.db`. Copy it off-box
and you can rehydrate on any other VPS in 5 minutes.

## Not in scope yet

- Community proof aggregation (Phase B) — schema slot reserved.
- Strategy marketplace payments (Phase C) — needs Stripe Connect or
  on-chain escrow.
- Email — wallet auth means no transactional email needed.
