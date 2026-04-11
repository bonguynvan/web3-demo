# Development Setup

## Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9 (for chart-lib monorepo)
- **npm** (for dapp-demo)
- **Foundry** (forge, anvil, cast) — for smart contracts
- **Git**

### Installing Foundry

Foundry is the toolchain for compiling and deploying the smart contracts.

```bash
# Install Foundry (Mac/Linux/WSL)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installation
forge --version    # Solidity compiler + test runner
anvil --version    # Local Ethereum node (like a local database for blockchain)
cast --version     # CLI to interact with contracts
```

> **Windows note:** Foundry works best in WSL2 or Git Bash. If you're on Windows
> without WSL, you can skip the contracts/keepers packages and just run the
> frontend with demo mode.

## What Each Package Does

```
dapp-demo/
├── src/                    # Frontend (React + Vite)
├── packages/
│   ├── contracts/          # Smart contracts (Solidity + Foundry)
│   │   └── src/            #   Vault, Router, PositionManager, PriceFeed
│   ├── keepers/            # Background bots (TypeScript)
│   │   └── src/            #   Liquidator + Price updater
│   └── server/             # Backend API + indexer (TypeScript)
│       └── src/            #   REST API + WebSocket + SQLite
└── ../chart-lib/           # Chart library (separate repo)
```

### In plain English:

| Package | What it is | Analogy |
|---------|-----------|---------|
| **contracts** | The "database + business logic" that runs on the blockchain. Once deployed, these rules can't be changed. | Like a bank's vault rules written in stone |
| **keepers** | Bots that watch the blockchain and take action (liquidate bad positions, update prices). | Like security cameras + automated alarms |
| **server** | A regular backend server that reads blockchain events and stores them in a database for fast querying. | Like a search index for blockchain data |
| **src/** (frontend) | The React app you see in the browser. Talks to the blockchain directly (via wallet) and to the server (for history/prices). | The customer-facing website |

---

## Quick Start (Local Development)

### Step 1: Clone & Install

```bash
cd ~/WebstormProjects/personal_project

# Clone both repos
git clone <dapp-demo-repo-url> dapp-demo
git clone <chart-lib-repo-url> chart-lib

# Install chart-lib
cd chart-lib && pnpm install && pnpm build

# Install dapp-demo
cd ../dapp-demo && npm install

# Install server dependencies
cd packages/server && pnpm install && cd ../..

# Install keepers dependencies
cd packages/keepers && pnpm install && cd ../..
```

### Step 2: Set Up Environment Variables

```bash
# Frontend .env (copy from example)
cp .env.example .env

# Edit .env and add your 0x API key for spot trading:
# VITE_0X_API_KEY=your-key-here
# Get one free at: https://dashboard.0x.org/
```

> The server and keepers use Anvil defaults — no .env needed for local dev.

### Step 3: Start Everything

The easiest way — one command starts Anvil + deploys contracts + runs server + keepers:

```bash
npm run dev:full
```

Or start each piece manually (useful for debugging):

```bash
# Terminal 1: Start the local blockchain
cd packages/contracts
npm run anvil
# This starts a local Ethereum node at http://127.0.0.1:8545
# It comes with 10 pre-funded test accounts (fake ETH, not real money)

# Terminal 2: Deploy contracts to the local blockchain
cd packages/contracts
npm run deploy:local
# This compiles the Solidity code and puts it on your local blockchain
# After this, you'll see contract addresses printed to the console

# Terminal 3: Start the price updater (simulates price movements)
cd packages/keepers
pnpm price-updater
# This bot updates ETH and BTC prices every 3 seconds on your local chain

# Terminal 4: Start the backend server
cd packages/server
pnpm dev
# API at http://localhost:3001, WebSocket at ws://localhost:3002

# Terminal 5: Start the frontend
npm run dev
# Open http://localhost:5173 in your browser
```

### Step 4: Use the App

1. Open http://localhost:5173
2. The app starts in **Demo mode** — no real wallet needed
3. Click **"+ 10K USDC"** to get test money
4. Try opening a Long or Short position on ETH-PERP
5. Click the **Spot** tab to try token swaps (needs Arbitrum + 0x API key)

---

## Environment Variables Reference

### Frontend (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `http://localhost:3001` | Backend REST API URL |
| `VITE_WS_URL` | No | `ws://localhost:3002` | Backend WebSocket URL |
| `VITE_0X_API_KEY` | For spot | — | 0x Swap API key ([get free](https://dashboard.0x.org/)) |
| `VITE_ARBITRUM_RPC_URL` | No | Public RPC | Custom Arbitrum RPC endpoint |

### Server (`packages/server/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RPC_URL` | No | `http://127.0.0.1:8545` | Blockchain RPC endpoint |
| `PORT` | No | `3001` | HTTP API port |
| `WS_PORT` | No | `3002` | WebSocket port |
| `*_ADDRESS` | No | Auto-detected | Contract addresses (override for non-Anvil) |

### Keepers (`packages/keepers/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RPC_URL` | No | `http://127.0.0.1:8545` | Blockchain RPC endpoint |
| `KEEPER_PRIVATE_KEY` | No | Anvil account 0 | Wallet private key for keeper bot |
| `*_ADDRESS` | No | Auto-detected | Contract addresses (override for non-Anvil) |

### Contracts (`packages/contracts/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEPLOYER_PRIVATE_KEY` | For testnet | Anvil key | Wallet private key for deploying |
| `RPC_URL` | No | `http://127.0.0.1:8545` | Target chain RPC |
| `CHAIN_ID` | No | `31337` | Target chain ID |
| `ETHERSCAN_API_KEY` | No | — | For contract verification on Arbiscan |

> **Security:** `.env` files are git-ignored. Never commit private keys.
> For local dev (Anvil), the default keys are pre-funded test accounts — not real money.

---

## Key Concepts for Beginners

### What is Anvil?

Anvil is a **fake blockchain** that runs on your computer. It behaves exactly like
Ethereum but:
- Transactions are instant (no waiting for blocks)
- Gas is free
- It comes with 10 accounts, each with 10,000 fake ETH
- When you restart it, everything resets (like restarting a database)

### What are Smart Contracts?

Smart contracts are programs that run on the blockchain. Once deployed, their
rules are permanent. In this project:

- **Vault** — holds all the money (USDC). Like a bank vault.
- **Router** — the front door. Users interact with this to open/close positions.
- **PositionManager** — tracks who has what position (long/short, size, leverage).
- **PriceFeed** — reads prices from oracles (Chainlink) to know what ETH/BTC costs.
- **USDC/WETH/WBTC** — fake tokens for testing (on Anvil they're mock versions).

### What are Keepers?

Keepers are bots that automate blockchain actions:

- **Price Updater** — simulates price movements on your local chain (in production,
  Chainlink does this automatically)
- **Liquidator** — watches all open positions and force-closes any that are about to
  go bankrupt (to protect the vault's money)

### What does the Server do?

The blockchain is like a write-only log — you can't easily search it. The server:
1. **Watches** blockchain events (new trades, liquidations, price updates)
2. **Stores** them in a SQLite database (fast, local, no setup needed)
3. **Serves** them via REST API + WebSocket so the frontend can show charts,
   trade history, and live prices

---

## How Chart Library Integration Works

dapp-demo imports `@chart-lib/*` packages, which are resolved to the sibling directory
via two mechanisms:

**Vite aliases** (for bundling + HMR):
```typescript
// vite.config.ts
resolve: {
  alias: {
    '@chart-lib/library': path.resolve(__dirname, '../chart-lib/packages/library/src'),
    '@chart-lib/core':    path.resolve(__dirname, '../chart-lib/packages/core/src'),
    '@chart-lib/commons': path.resolve(__dirname, '../chart-lib/packages/commons/src'),
  }
}
```

**TypeScript paths** (for IDE intellisense + type checking):
```json
// tsconfig.app.json
"paths": {
  "@chart-lib/library": ["../chart-lib/packages/library/src"],
  "@chart-lib/core":    ["../chart-lib/packages/core/src"],
  "@chart-lib/commons": ["../chart-lib/packages/commons/src"]
}
```

Changes to `../chart-lib/` automatically reload in dapp-demo via Vite HMR.
Chart library source lives exclusively in `../chart-lib/`.

---

## All Available Scripts

### Root (dapp-demo)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (frontend only) |
| `npm run dev:full` | Start Anvil + deploy + server + keepers + frontend |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build |

### Contracts (`packages/contracts`)

| Script | Description |
|--------|-------------|
| `npm run anvil` | Start local Anvil blockchain |
| `npm run build` | Compile Solidity contracts (`forge build`) |
| `npm run test` | Run contract tests (`forge test`) |
| `npm run deploy:local` | Deploy contracts to local Anvil |
| `npm run export-abi` | Export ABIs to TypeScript for frontend |

### Server (`packages/server`)

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start server with auto-reload |
| `pnpm start` | Start server (production) |
| `pnpm build` | Compile TypeScript |

### Keepers (`packages/keepers`)

| Script | Description |
|--------|-------------|
| `pnpm liquidator` | Run the liquidation bot |
| `pnpm price-updater` | Run the price simulation bot |

---

## Troubleshooting

### "Contract not found" or wrong addresses

The deploy script writes addresses to `src/addresses.json`. If this file is
missing or stale, redeploy:

```bash
cd packages/contracts
npm run deploy:local
```

### Server won't start / database errors

Delete the SQLite database and restart:

```bash
rm -rf packages/server/data/indexer.db
cd packages/server && pnpm dev
```

### Anvil restarted and everything broke

Anvil resets on restart. You need to redeploy contracts:

```bash
cd packages/contracts && npm run deploy:local
# Then restart server and keepers
```

### Spot trading doesn't work

1. Make sure `VITE_0X_API_KEY` is set in `.env`
2. Connect your wallet to **Arbitrum One** (not Anvil)
3. You need real ETH on Arbitrum for gas fees

---

## Architecture

See [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) for the full architecture guide.

## Platform Roadmap

See [PLATFORM_PLAN.md](./PLATFORM_PLAN.md) for the multi-market DeFi platform plan.
