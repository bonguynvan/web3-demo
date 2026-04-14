#!/usr/bin/env node
/**
 * dev.mjs — Start the entire Perp DEX stack for local development.
 *
 * Services launched (in order):
 *   1. Anvil          — local Ethereum node
 *   2. Contracts       — deploy via forge script (skipped if already deployed)
 *   3. Price updater   — keeper that feeds oracle prices from Binance
 *   4. Liquidator      — keeper that liquidates unhealthy positions
 *   5. Backend server  — REST + WebSocket + event indexer (Hono + SQLite)
 *   6. Vite            — frontend dev server
 *
 * Ctrl+C kills everything cleanly.
 *
 * Usage:
 *   node scripts/dev.mjs          # start all services
 *   pnpm dev:full                 # same via package.json script
 *
 * Environment:
 *   Services that need contract addresses read them from src/addresses.json
 *   (written by step 2). No manual env vars needed for local Anvil dev.
 *
 * Keepers use Anvil Account 1 (0x7099…79C8) to avoid nonce collisions
 * with the deployer (Account 0) or user trading accounts (Account 2-3).
 */

import { spawn, execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ─── Config ─────────────────────────────────────────────────────────────────

const PORTS = {
  anvil: 8545,
  backend: 3001,
  backendWs: 3002,
  vite: 5173,
}

// Anvil Account 1 — dedicated keeper key. NOT the deployer (Account 0),
// so keepers and the user's trading wallet never fight over the same nonce.
const KEEPER_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

// ─── Foundry binary discovery ───────────────────────────────────────────────

const HOME = process.env.HOME || process.env.USERPROFILE || ''
const FOUNDRY_BIN = resolve(HOME, '.foundry/bin')
const FORGE = [resolve(FOUNDRY_BIN, 'forge'), resolve(FOUNDRY_BIN, 'forge.exe')].find(p => existsSync(p)) || 'forge'
const ANVIL = [resolve(FOUNDRY_BIN, 'anvil'), resolve(FOUNDRY_BIN, 'anvil.exe')].find(p => existsSync(p)) || 'anvil'

// ─── Colors ─────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

const SERVICE_COLORS = {
  anvil: C.cyan,
  keeper: C.yellow,
  liquidator: C.magenta,
  server: C.blue,
  vite: C.green,
}

function prefixedLog(name, color, data) {
  const lines = data.toString().split('\n').filter(l => l.trim())
  for (const line of lines) {
    // Skip noisy viem docs links
    if (line.includes('Docs: https://viem.sh')) continue
    if (line.includes('Version: viem@')) continue
    console.log(`${color}[${name}]${C.reset} ${line}`)
  }
}

// ─── Process management ─────────────────────────────────────────────────────

const children = []

function cleanup() {
  console.log(`\n${C.yellow}Shutting down all services...${C.reset}`)
  for (const child of children) {
    try { child.kill('SIGTERM') } catch {}
  }
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM anvil.exe', { stdio: 'ignore' })
    } else {
      execSync('pkill -f anvil', { stdio: 'ignore' })
    }
  } catch {}
  console.log(`${C.green}All services stopped.${C.reset}`)
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

function runService(name, cmd, args, opts = {}) {
  const isWin = process.platform === 'win32'
  const color = SERVICE_COLORS[name] || C.white
  const child = spawn(cmd, args, {
    stdio: 'pipe',
    cwd: opts.cwd || ROOT,
    shell: isWin,
    env: { ...process.env, FORCE_COLOR: '1', ...opts.env },
  })
  children.push(child)

  // Forward logs with colored prefix
  if (!opts.silent) {
    child.stdout?.on('data', d => prefixedLog(name, color, d))
    child.stderr?.on('data', d => prefixedLog(name, color, d))
  }

  // Detect unexpected exits
  child.on('close', (code) => {
    if (code !== null && code !== 0) {
      console.log(`${C.red}[${name}] exited with code ${code}${C.reset}`)
    }
  })

  return child
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Health checks ──────────────────────────────────────────────────────────

async function waitForRpc(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      })
      if (res.ok) return true
    } catch {}
    await sleep(1000)
  }
  return false
}

async function isPortInUse(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(500),
    })
    return res.ok || res.status > 0
  } catch {
    return false
  }
}

async function waitForBackend(maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORTS.backend}/health`, {
        signal: AbortSignal.timeout(1000),
      })
      const body = await res.json()
      if (body?.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

async function checkContractsDeployed() {
  // Read the USDC address from addresses.json if it exists, otherwise
  // use the deterministic first-deploy address for a fresh Anvil.
  let usdcAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
  try {
    const addrs = JSON.parse(readFileSync(resolve(ROOT, 'src/addresses.json'), 'utf-8'))
    if (addrs.usdc) usdcAddress = addrs.usdc
  } catch {}

  try {
    const res = await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_getCode',
        params: [usdcAddress, 'latest'],
      }),
    })
    const data = await res.json()
    return data.result && data.result.length > 2
  } catch {
    return false
  }
}

function loadAddresses() {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, 'src/addresses.json'), 'utf-8'))
  } catch {
    return null
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const TOTAL_STEPS = 6

  console.log(`${C.cyan}╔══════════════════════════════════════╗${C.reset}`)
  console.log(`${C.cyan}║     Perp DEX — Local Dev Stack       ║${C.reset}`)
  console.log(`${C.cyan}╚══════════════════════════════════════╝${C.reset}`)
  console.log()

  // ── 1. Anvil ──────────────────────────────────────────────────────────────

  const anvilAlive = await waitForRpc(2)
  if (anvilAlive) {
    console.log(`${C.green}[1/${TOTAL_STEPS}] Anvil already running on :${PORTS.anvil} (reusing)${C.reset}`)
  } else {
    try {
      if (process.platform === 'win32') {
        execSync('taskkill /F /IM anvil.exe', { stdio: 'ignore' })
      } else {
        execSync('pkill -f anvil', { stdio: 'ignore' })
      }
    } catch {}
    await sleep(500)

    console.log(`${C.yellow}[1/${TOTAL_STEPS}] Starting Anvil...${C.reset}`)
    runService('anvil', ANVIL, ['--host', '127.0.0.1', '--port', String(PORTS.anvil)], { silent: true })

    const rpcReady = await waitForRpc()
    if (!rpcReady) {
      console.error(`${C.red}  ✗ Anvil failed to start. Is foundry installed?${C.reset}`)
      console.log(`${C.dim}    Install: curl -L https://foundry.paradigm.xyz | bash && foundryup${C.reset}`)
      process.exit(1)
    }
    console.log(`${C.green}  ✓ Anvil running on :${PORTS.anvil}${C.reset}`)
  }

  // ── 2. Deploy contracts ───────────────────────────────────────────────────

  console.log(`${C.yellow}[2/${TOTAL_STEPS}] Deploying contracts...${C.reset}`)
  const deployed = await checkContractsDeployed()
  if (deployed) {
    console.log(`${C.green}  ✓ Contracts already deployed (skipping)${C.reset}`)
  } else {
    try {
      const { rmSync } = await import('fs')
      rmSync(resolve(ROOT, 'packages/contracts/broadcast'), { recursive: true, force: true })
    } catch {}
    try {
      execSync(
        `"${FORGE}" script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:${PORTS.anvil} --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`,
        { cwd: resolve(ROOT, 'packages/contracts'), stdio: ['pipe', 'pipe', 'pipe'], timeout: 300000 }
      )
      console.log(`${C.green}  ✓ Contracts deployed${C.reset}`)
    } catch (err) {
      const msg = (err.stdout?.toString() || '') + (err.stderr?.toString() || '')
      if (msg.includes('ONCHAIN EXECUTION COMPLETE') || msg.includes('nonce too low')) {
        console.log(`${C.green}  ✓ Contracts deployed (with warnings)${C.reset}`)
      } else {
        console.error(`${C.red}  ✗ Deploy failed:${C.reset}`, (err.stderr?.toString() || err.message).slice(0, 200))
        console.log(`${C.dim}    Run manually: cd packages/contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974...${C.reset}`)
      }
    }
  }

  // Export addresses
  try {
    execSync('node scripts/export-addresses.mjs', { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] })
    console.log(`${C.green}  ✓ Addresses exported to src/addresses.json${C.reset}`)
  } catch {
    console.log(`${C.yellow}  ⚠ Could not export addresses${C.reset}`)
  }

  // Build env vars from deployed addresses
  const addrs = loadAddresses()
  const addrEnv = addrs ? {
    USDC_ADDRESS: addrs.usdc,
    WETH_ADDRESS: addrs.weth,
    WBTC_ADDRESS: addrs.wbtc,
    ETH_ORACLE_ADDRESS: addrs.ethOracle,
    BTC_ORACLE_ADDRESS: addrs.btcOracle,
    PLP_ADDRESS: addrs.plp,
    PRICE_FEED_ADDRESS: addrs.priceFeed,
    VAULT_ADDRESS: addrs.vault,
    POSITION_MANAGER_ADDRESS: addrs.positionManager,
    ROUTER_ADDRESS: addrs.router,
  } : {}

  // ── 3. Price updater keeper ───────────────────────────────────────────────

  console.log(`${C.yellow}[3/${TOTAL_STEPS}] Starting price updater...${C.reset}`)
  runService('keeper', 'npx', ['tsx', 'src/price-updater.ts'], {
    cwd: resolve(ROOT, 'packages/keepers'),
    env: { ...addrEnv, KEEPER_PRIVATE_KEY: KEEPER_PK },
  })
  await sleep(500)
  console.log(`${C.green}  ✓ Price updater running (Account 1)${C.reset}`)

  // ── 4. Liquidator keeper ──────────────────────────────────────────────────

  console.log(`${C.yellow}[4/${TOTAL_STEPS}] Starting liquidator...${C.reset}`)
  runService('liquidator', 'npx', ['tsx', 'src/liquidator.ts'], {
    cwd: resolve(ROOT, 'packages/keepers'),
    env: { ...addrEnv, KEEPER_PRIVATE_KEY: KEEPER_PK },
  })
  await sleep(500)
  console.log(`${C.green}  ✓ Liquidator running (Account 1)${C.reset}`)

  // ── 5. Backend server ─────────────────────────────────────────────────────

  console.log(`${C.yellow}[5/${TOTAL_STEPS}] Starting backend server...${C.reset}`)
  const serverAlive = await isPortInUse(PORTS.backend)
  if (serverAlive) {
    console.log(`${C.green}  ✓ Backend already running on :${PORTS.backend} (reusing)${C.reset}`)
  } else {
    runService('server', 'npx', ['tsx', 'watch', 'src/index.ts'], {
      cwd: resolve(ROOT, 'packages/server'),
      env: addrEnv,
    })

    const healthy = await waitForBackend()
    if (healthy) {
      console.log(`${C.green}  ✓ Backend healthy on :${PORTS.backend} (REST) + :${PORTS.backendWs} (WS)${C.reset}`)
    } else {
      console.log(`${C.yellow}  ⚠ Backend started but health check timed out — may still be indexing${C.reset}`)
    }
  }

  // ── 6. Vite frontend ──────────────────────────────────────────────────────

  console.log(`${C.yellow}[6/${TOTAL_STEPS}] Starting Vite dev server...${C.reset}`)
  console.log()
  console.log(`${C.cyan}══════════════════════════════════════${C.reset}`)
  console.log(`${C.green}  All services running!${C.reset}`)
  console.log()
  console.log(`  Frontend:   ${C.cyan}http://localhost:${PORTS.vite}${C.reset}`)
  console.log(`  Backend:    ${C.cyan}http://localhost:${PORTS.backend}${C.reset}  (REST)`)
  console.log(`              ${C.cyan}ws://localhost:${PORTS.backendWs}${C.reset}    (WebSocket)`)
  console.log(`  Anvil RPC:  ${C.cyan}http://localhost:${PORTS.anvil}${C.reset}`)
  console.log()
  console.log(`  ${C.yellow}Accounts:${C.reset}`)
  console.log(`  Account 0 (deployer):  0xf39F...2266  — $1M USDC (admin only)`)
  console.log(`  Account 1 (keepers):   0x7099...79C8  — reserved for keepers`)
  console.log(`  Account 2 (trading):   0x3C44...93BC  — $100K USDC`)
  console.log(`  Account 3 (trading):   0x90F7...b906  — $100K USDC`)
  console.log()
  console.log(`  ${C.dim}Keepers use Account 1 to avoid nonce collisions with your wallet.${C.reset}`)
  console.log(`  ${C.dim}Connect Account 2 or 3 for trading in Live mode.${C.reset}`)
  console.log()
  console.log(`  Press ${C.red}Ctrl+C${C.reset} to stop everything.`)
  console.log(`${C.cyan}══════════════════════════════════════${C.reset}`)
  console.log()

  // Vite runs in foreground with inherited stdio
  const vite = runService('vite', 'npx', ['vite', '--host'], { silent: true })
  // Forward only Vite's stdout (the URL output), skip noisy HMR logs
  vite.stdout?.on('data', d => {
    const text = d.toString()
    if (text.includes('http') || text.includes('ready') || text.includes('error')) {
      process.stdout.write(text)
    }
  })
  vite.stderr?.on('data', d => {
    const text = d.toString()
    if (text.includes('error') || text.includes('Error')) {
      prefixedLog('vite', SERVICE_COLORS.vite, d)
    }
  })
  vite.on('close', () => cleanup())
}

main().catch(err => {
  console.error(err)
  cleanup()
})
