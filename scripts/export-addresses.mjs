/**
 * export-addresses.mjs — Read deployed contract addresses from forge broadcast
 * and write them to a JSON file the frontend can import.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const BROADCAST = resolve(ROOT, 'packages/contracts/broadcast/DeployLocal.s.sol/31337/run-latest.json')
const OUTPUT = resolve(ROOT, 'src/addresses.json')

try {
  const run = JSON.parse(readFileSync(BROADCAST, 'utf-8'))

  const nameCount = {}
  const addresses = {}

  for (const tx of run.transactions) {
    if (tx.transactionType === 'CREATE' && tx.contractName) {
      const name = tx.contractName
      nameCount[name] = (nameCount[name] ?? 0) + 1

      if (name === 'MockERC20') {
        if (nameCount[name] === 1) addresses.usdc = tx.contractAddress
        if (nameCount[name] === 2) addresses.weth = tx.contractAddress
        if (nameCount[name] === 3) addresses.wbtc = tx.contractAddress
      } else if (name === 'MockChainlinkAggregator') {
        if (nameCount[name] === 1) addresses.ethOracle = tx.contractAddress
        if (nameCount[name] === 2) addresses.btcOracle = tx.contractAddress
      } else if (name === 'PLP') {
        addresses.plp = tx.contractAddress
      } else if (name === 'PriceFeed') {
        addresses.priceFeed = tx.contractAddress
      } else if (name === 'Vault') {
        addresses.vault = tx.contractAddress
      } else if (name === 'PositionManager') {
        addresses.positionManager = tx.contractAddress
      } else if (name === 'Router') {
        addresses.router = tx.contractAddress
      }
    }
  }

  writeFileSync(OUTPUT, JSON.stringify(addresses, null, 2) + '\n')
  console.log(`Exported ${Object.keys(addresses).length} addresses to ${OUTPUT}`)
  console.log(addresses)
} catch (err) {
  console.error('Failed to export addresses:', err.message)
  process.exit(1)
}
