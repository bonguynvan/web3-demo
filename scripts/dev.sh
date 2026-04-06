#!/usr/bin/env bash
#
# dev.sh — Start the entire Perp DEX stack for local development.
#
# Launches: Anvil → Deploy contracts → Price updater → Liquidator → Vite
# Kills everything on Ctrl+C.
#
# Usage:
#   bash scripts/dev.sh
#   # or: npm run dev:full (if added to root package.json)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FORGE="$HOME/.foundry/bin/forge"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Track PIDs for cleanup
PIDS=()

cleanup() {
  echo -e "\n${YELLOW}Shutting down all services...${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Also kill anvil by name in case it was already running
  pkill -f "anvil.*8545" 2>/dev/null || true
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}

trap cleanup EXIT INT TERM

wait_for_rpc() {
  local max_attempts=30
  local attempt=0
  while ! curl -sf http://127.0.0.1:8545 -X POST \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' > /dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo -e "${RED}Anvil failed to start after ${max_attempts}s${NC}"
      exit 1
    fi
    sleep 1
  done
}

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Perp DEX — Local Dev Stack       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Kill any existing Anvil ──
pkill -f "anvil.*8545" 2>/dev/null || true
sleep 1

# ── 2. Start Anvil ──
echo -e "${YELLOW}[1/5] Starting Anvil...${NC}"
anvil --host 127.0.0.1 --port 8545 --block-time 1 > /dev/null 2>&1 &
PIDS+=($!)
wait_for_rpc
echo -e "${GREEN}  ✓ Anvil running on :8545${NC}"

# ── 3. Deploy contracts ──
echo -e "${YELLOW}[2/5] Deploying contracts...${NC}"
cd "$ROOT_DIR/packages/contracts"
"$FORGE" script script/DeployLocal.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  > /dev/null 2>&1
echo -e "${GREEN}  ✓ Contracts deployed${NC}"

# ── 4. Start price updater ──
echo -e "${YELLOW}[3/5] Starting price updater...${NC}"
cd "$ROOT_DIR/packages/keepers"
npx tsx src/price-updater.ts > /dev/null 2>&1 &
PIDS+=($!)
echo -e "${GREEN}  ✓ Price updater running (updates every 3s)${NC}"

# ── 5. Start liquidator ──
echo -e "${YELLOW}[4/5] Starting liquidator...${NC}"
npx tsx src/liquidator.ts > /dev/null 2>&1 &
PIDS+=($!)
echo -e "${GREEN}  ✓ Liquidator running (polls every 2s)${NC}"

# ── 6. Start Vite dev server ──
echo -e "${YELLOW}[5/5] Starting Vite dev server...${NC}"
cd "$ROOT_DIR"

echo ""
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  All services running!${NC}"
echo ""
echo -e "  Frontend:   ${CYAN}http://localhost:5173${NC}"
echo -e "  Anvil RPC:  ${CYAN}http://localhost:8545${NC}"
echo ""
echo -e "  ${YELLOW}Anvil accounts pre-funded with USDC:${NC}"
echo -e "  Account 0 (deployer): 0xf39F...2266  — \$1,000,000"
echo -e "  Account 1:            0x7099...79C8  — \$100,000"
echo -e "  Account 2:            0x3C44...93BC  — \$100,000"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop everything."
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo ""

# Run Vite in foreground (so Ctrl+C triggers cleanup)
npx vite --host
