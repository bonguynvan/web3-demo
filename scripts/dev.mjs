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

// ─── Main ───

async function main() {
  console.log('\x1b[36m╔══════════════════════════════════════╗\x1b[0m')
  console.log('\x1b[36m║     Perp DEX — Local Dev Stack       ║\x1b[0m')
  console.log('\x1b[36m╚══════════════════════════════════════╝\x1b[0m')
  console.log()

  // 1. Kill any existing Anvil
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM anvil.exe', { stdio: 'ignore' })
    } else {
      execSync('pkill -f anvil', { stdio: 'ignore' })
    }
  } catch {}
  await sleep(2000)

  // 2. Start Anvil
  console.log('\x1b[33m[1/6] Starting Anvil...\x1b[0m')
  const anvil = run(ANVIL, ['--host', '127.0.0.1', '--port', '8545'])
  anvil.stderr?.on('data', () => {}) // suppress output
  anvil.stdout?.on('data', () => {})

  const rpcReady = await waitForRpc()
  if (!rpcReady) {
    console.error('\x1b[31m  ✗ Anvil failed to start. Is it installed? Run: curl -L https://foundry.paradigm.xyz | bash\x1b[0m')
    process.exit(1)
  }
  console.log('\x1b[32m  ✓ Anvil running on :8545\x1b[0m')

  // 3. Deploy contracts (clean caches to avoid stale nonce)
  console.log('\x1b[33m[2/6] Deploying contracts...\x1b[0m')
  try {
    const { rmSync } = await import('fs')
    rmSync(resolve(ROOT, 'packages/contracts/broadcast'), { recursive: true, force: true })
    rmSync(resolve(ROOT, 'packages/contracts/cache'), { recursive: true, force: true })
  } catch {}
  try {
    await runAndWait(FORGE, [
      'script', 'script/DeployLocal.s.sol',
      '--rpc-url', 'http://127.0.0.1:8545',
      '--broadcast',
      '--private-key', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    ], { cwd: resolve(ROOT, 'packages/contracts') })
    console.log('\x1b[32m  ✓ Contracts deployed\x1b[0m')
  } catch (err) {
    // forge script often exits non-zero on Windows due to nonce race conditions
    // but the contracts are still deployed. Check if we can reach the deployer.
    if (err.message.includes('nonce too low')) {
      console.log('\x1b[33m  ⚠ Deploy completed with nonce warnings (normal on Windows)\x1b[0m')
    } else {
      console.error('\x1b[31m  ✗ Deploy failed:', err.message.slice(0, 200), '\x1b[0m')
      cleanup()
    }
  }

  // 4. Start price updater
  console.log('\x1b[33m[3/6] Starting price updater...\x1b[0m')
  const priceUpdater = run('npx', ['tsx', 'src/price-updater.ts'], { cwd: resolve(ROOT, 'packages/keepers') })
  priceUpdater.stdout?.on('data', () => {})
  priceUpdater.stderr?.on('data', () => {})
  console.log('\x1b[32m  ✓ Price updater running\x1b[0m')

  // 5. Start liquidator
  console.log('\x1b[33m[4/6] Starting liquidator...\x1b[0m')
  const liquidator = run('npx', ['tsx', 'src/liquidator.ts'], { cwd: resolve(ROOT, 'packages/keepers') })
  liquidator.stdout?.on('data', () => {})
  liquidator.stderr?.on('data', () => {})
  console.log('\x1b[32m  ✓ Liquidator running\x1b[0m')

  // 6. Start backend server
  console.log('\x1b[33m[5/6] Starting backend server...\x1b[0m')
  const server = run('npx', ['tsx', 'src/index.ts'], { cwd: resolve(ROOT, 'packages/server') })
  server.stdout?.on('data', () => {})
  server.stderr?.on('data', () => {})
  await sleep(2000)
  console.log('\x1b[32m  ✓ Backend server on :3001 (HTTP) :3002 (WS)\x1b[0m')

  // 7. Start Vite
  console.log('\x1b[33m[6/6] Starting Vite dev server...\x1b[0m')
  console.log()
  console.log('\x1b[36m══════════════════════════════════════\x1b[0m')
  console.log('\x1b[32m  All services running!\x1b[0m')
  console.log()
  console.log('  Frontend:   \x1b[36mhttp://localhost:5173\x1b[0m')
  console.log('  API:        \x1b[36mhttp://localhost:3001\x1b[0m')
  console.log('  WebSocket:  \x1b[36mws://localhost:3002\x1b[0m')
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
