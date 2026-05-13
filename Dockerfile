# TradingDek SPA — multi-stage build.
#
# Stage 1: Node 22 + pnpm (Vite 8 requires Node 20.19+). Vars prefixed
# with VITE_ are baked into the bundle at build time so they need to
# arrive as docker --build-arg, NOT runtime env. Coolify forwards UI
# env values into build args automatically when wired via docker-compose.
#
# Stage 2: nginx:alpine serving the dist/ output. SPA fallback +
# long-cache hashed assets live in nginx.conf.

FROM node:22-alpine AS builder

# Enable pnpm via corepack (built-in since Node 16).
RUN corepack enable

WORKDIR /app

# Build-time env. Empty defaults = "feature off" — SPA stays inert
# unless Coolify (or the build invoker) sets them.
ARG VITE_API_BASE=
ARG VITE_NOWPAY_PUBLIC_KEY=
ARG VITE_PLAUSIBLE_DOMAIN=
ARG VITE_FEEDBACK_EMAIL=
ARG VITE_BINANCE_REST_BASE=
ARG VITE_ERROR_REPORT_ENDPOINT=
ARG VITE_HYPERLIQUID_BUILDER_CODE=
ARG VITE_HYPERLIQUID_NETWORK=mainnet
ARG VITE_CRYPTOPANIC_TOKEN=
ARG VITE_HL_WHALE_WALLETS=

ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_NOWPAY_PUBLIC_KEY=$VITE_NOWPAY_PUBLIC_KEY \
    VITE_PLAUSIBLE_DOMAIN=$VITE_PLAUSIBLE_DOMAIN \
    VITE_FEEDBACK_EMAIL=$VITE_FEEDBACK_EMAIL \
    VITE_BINANCE_REST_BASE=$VITE_BINANCE_REST_BASE \
    VITE_ERROR_REPORT_ENDPOINT=$VITE_ERROR_REPORT_ENDPOINT \
    VITE_HYPERLIQUID_BUILDER_CODE=$VITE_HYPERLIQUID_BUILDER_CODE \
    VITE_HYPERLIQUID_NETWORK=$VITE_HYPERLIQUID_NETWORK \
    VITE_CRYPTOPANIC_TOKEN=$VITE_CRYPTOPANIC_TOKEN \
    VITE_HL_WHALE_WALLETS=$VITE_HL_WHALE_WALLETS

# Install deps first for layer caching.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ─── Stage 2: nginx ────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
