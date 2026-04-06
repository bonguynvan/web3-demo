/**
 * dev.mjs — Start the entire Perp DEX stack for local development.
 *
 * Launches: Anvil → Deploy contracts → Price updater → Liquidator → Backend server → Vite
 * Kills everything on Ctrl+C.
 *
 * Usage: node scripts/dev.mjs
 */

import { spawn, execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Find foundry binaries
const HOME = process.env.HOME || process.env.USERPROFILE || ''
const FOUNDRY_BIN = resolve(HOME, '.foundry/bin')

const FORGE_PATHS = [resolve(FOUNDRY_BIN, 'forge'), resolve(FOUNDRY_BIN, 'forge.exe')]
const FORGE = FORGE_PATHS.find(p => existsSync(p)) || 'forge'

const ANVIL_PATHS = [resolve(FOUNDRY_BIN, 'anvil'), resolve(FOUNDRY_BIN, 'anvil.exe')]
const ANVIL = ANVIL_PATHS.find(p => existsSync(p)) || 'anvil'

// Track child processes for cleanup
const children = []

function cleanup() {
  console.log('\n\x1b[33mShutting down all services...\x1b[0m')
  for (const child of children) {
    try { child.kill('SIGTERM') } catch {}
  }
  // Also kill anvil
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM anvil.exe', { stdio: 'ignore' })
    } else {
      execSync('pkill -f anvil', { stdio: 'ignore' })
    }
  } catch {}
  console.log('\x1b[32mAll services stopped.\x1b[0m')
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('exit', cleanup)

function run(cmd, args, opts = {}) {
  // On Windows, use shell to resolve .cmd/.bat wrappers (npx, forge, etc.)
  const isWin = process.platform === 'win32'
  const child = spawn(cmd, args, {
    stdio: opts.stdio || 'pipe',
    cwd: opts.cwd || ROOT,
    shell: isWin,
    windowsVerbatimArguments: false,
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  children.push(child)
  return child
}

function runAndWait(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32'
    const child = spawn(cmd, args, {
      stdio: opts.stdio || 'pipe',
      cwd: opts.cwd || ROOT,
      shell: isWin,
      windowsVerbatimArguments: false,
      env: { ...process.env, FORCE_COLOR: '1' },
    })
    let stdout = ''
    let stderr = ''
    if (child.stdout) child.stdout.on('data', d => stdout += d)
    if (child.stderr) child.stderr.on('data', d => stderr += d)
    child.on('close', code => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${cmd} exited with code ${code}\n${stderr}`))
    })
    child.on('error', reject)
  })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

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

async function checkContractsDeployed() {
  // Check if the first deployed contract (USDC MockERC20) has code
  // Default USDC address from DeployLocal deterministic deploy
  try {
    const res = await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_getCode',
        params: ['0x5FbDB2315678afecb367f032d93F642f64180aa3', 'latest'],
      }),
    })
    const data = await res.json()
    // If code is more than '0x' (empty), contract exists
    return data.result && data.result.length > 2
  } catch {
    return false
  }
}

// ─── Main ───

async function main() {
  console.log('\x1b[36m╔══════════════════════════════════════╗\x1b[0m')
  console.log('\x1b[36m║     Perp DEX — Local Dev Stack       ║\x1b[0m')
  console.log('\x1b[36m╚══════════════════════════════════════╝\x1b[0m')
  console.log()

  // 1. Check if Anvil is already running (reuse it to keep deployed contracts)
  const anvilAlive = await waitForRpc(2)
  let anvil = null
  if (anvilAlive) {
    console.log('\x1b[32m[1/5] Anvil already running on :8545 (reusing)\x1b[0m')
  } else {
    // Kill stale processes and start fresh
    try {
      if (process.platform === 'win32') {
        execSync('taskkill /F /IM anvil.exe', { stdio: 'ignore' })
      } else {
        execSync('pkill -f anvil', { stdio: 'ignore' })
      }
    } catch {}
    await sleep(1000)

    console.log('\x1b[33m[1/5] Starting Anvil...\x1b[0m')
    anvil = run(ANVIL, ['--host', '127.0.0.1', '--port', '8545'])
    anvil.stderr?.on('data', () => {})
    anvil.stdout?.on('data', () => {})

    const rpcReady = await waitForRpc()
    if (!rpcReady) {
      console.error('\x1b[31m  ✗ Anvil failed to start. Is it installed?\x1b[0m')
      process.exit(1)
    }
    console.log('\x1b[32m  ✓ Anvil running on :8545\x1b[0m')
  }

  // 3. Deploy contracts (skip if already deployed on this Anvil)
  console.log('\x1b[33m[2/5] Deploying contracts...\x1b[0m')
  const deployed = await checkContractsDeployed()
  if (deployed) {
    console.log('\x1b[32m  ✓ Contracts already deployed (skipping)\x1b[0m')
  } else {
    try {
      const { rmSync } = await import('fs')
      rmSync(resolve(ROOT, 'packages/contracts/broadcast'), { recursive: true, force: true })
    } catch {}
    try {
      // Build + deploy in one execSync with generous timeout
      execSync(
        `"${FORGE}" script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`,
        { cwd: resolve(ROOT, 'packages/contracts'), stdio: ['pipe', 'pipe', 'pipe'], timeout: 300000 }
      )
      console.log('\x1b[32m  ✓ Contracts deployed\x1b[0m')
    } catch (err) {
      const stdout = err.stdout?.toString() || ''
      const stderr = err.stderr?.toString() || ''
      const msg = stdout + stderr
      if (msg.includes('ONCHAIN EXECUTION COMPLETE') || msg.includes('nonce too low')) {
        console.log('\x1b[32m  ✓ Contracts deployed (with warnings)\x1b[0m')
      } else {
        console.error('\x1b[31m  ✗ Deploy issue:', (stderr || err.message).slice(0, 300), '\x1b[0m')
        console.log('\x1b[33m  Tip: Run manually: cd packages/contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80\x1b[0m')
      }
    }
  }

  // 3b. Export addresses from broadcast to src/addresses.json
  try {
    execSync('node scripts/export-addresses.mjs', { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] })
    console.log('\x1b[32m  ✓ Addresses exported to src/addresses.json\x1b[0m')
  } catch {
    console.log('\x1b[33m  ⚠ Could not export addresses (run deploy manually first)\x1b[0m')
  }

  // Read deployed addresses for env vars
  let addrEnv = {}
  try {
    const { readFileSync } = await import('fs')
    const addrs = JSON.parse(readFileSync(resolve(ROOT, 'src/addresses.json'), 'utf-8'))
    addrEnv = {
      USDC_ADDRESS: addrs.usdc,
      WETH_ADDRESS: addrs.weth,
      WBTC_ADDRESS: addrs.wbtc,
      ETH_ORACLE_ADDRESS: addrs.ethOracle,
      BTC_ORACLE_ADDRESS: addrs.btcOracle,
      PRICE_FEED_ADDRESS: addrs.priceFeed,
      VAULT_ADDRESS: addrs.vault,
      POSITION_MANAGER_ADDRESS: addrs.positionManager,
      ROUTER_ADDRESS: addrs.router,
    }
  } catch {}

  // 3. Start price updater
  console.log('\x1b[33m[3/5] Starting price updater...\x1b[0m')
  const priceUpdater = run('npx', ['tsx', 'src/price-updater.ts'], { cwd: resolve(ROOT, 'packages/keepers'), env: { ...process.env, ...addrEnv } })
  priceUpdater.stdout?.on('data', () => {})
  priceUpdater.stderr?.on('data', () => {})
  console.log('\x1b[32m  ✓ Price updater running\x1b[0m')

  // 4. Start liquidator
  console.log('\x1b[33m[4/5] Starting liquidator...\x1b[0m')
  const liquidator = run('npx', ['tsx', 'src/liquidator.ts'], { cwd: resolve(ROOT, 'packages/keepers'), env: { ...process.env, ...addrEnv } })
  liquidator.stdout?.on('data', () => {})
  liquidator.stderr?.on('data', () => {})
  console.log('\x1b[32m  ✓ Liquidator running\x1b[0m')

  // 6. Start Vite
  console.log('\x1b[33m[5/5] Starting Vite dev server...\x1b[0m')
  console.log()
  console.log('\x1b[36m══════════════════════════════════════\x1b[0m')
  console.log('\x1b[32m  All services running!\x1b[0m')
  console.log()
  console.log('  Frontend:   \x1b[36mhttp://localhost:5173\x1b[0m')
  console.log('  Anvil RPC:  \x1b[36mhttp://localhost:8545\x1b[0m')
  console.log()
  console.log('  \x1b[33mAnvil accounts pre-funded with USDC:\x1b[0m')
  console.log('  Account 0 (deployer): 0xf39F...2266  — $1,000,000')
  console.log('  Account 1:            0x7099...79C8  — $100,000')
  console.log('  Account 2:            0x3C44...93BC  — $100,000')
  console.log()
  console.log('  Press \x1b[31mCtrl+C\x1b[0m to stop everything.')
  console.log('\x1b[36m══════════════════════════════════════\x1b[0m')
  console.log()

  // Vite runs in foreground with inherited stdio
  const vite = run('npx', ['vite', '--host'], { stdio: 'inherit' })
  vite.on('close', () => cleanup())
}

main().catch(err => {
  console.error(err)
  cleanup()
})
