#!/usr/bin/env node
/**
 * check-bundle-size — fail the build if a JS/CSS chunk regresses past
 * its budget.
 *
 * Run after `vite build`. Walks dist/ and groups files into named
 * buckets defined below. Each bucket has a hard `budget` and an
 * optional soft `warn` threshold. Exits 1 on any hard breach; soft
 * breaches print a notice but pass unless BUDGET_STRICT=1 is set.
 *
 * The "entry" bucket is the most important — it's what every visitor
 * downloads before they can see anything. Keep it tight.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs
 *   BUDGET_STRICT=1 node scripts/check-bundle-size.mjs
 */

import { readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')

const KB = 1024

/**
 * Buckets are evaluated top to bottom against every file in dist/.
 * A file can fall into multiple buckets if its path matches multiple
 * `include` patterns; that's intentional (e.g. TradePage chunk shows
 * up under "Chart route" and "All JS combined").
 *
 * @type {{ name: string, include: RegExp[], exclude?: RegExp[], budget: number, warn?: number }[]}
 */
const BUCKETS = [
  {
    name: 'Entry chunk (index)',
    include: [/^assets\/index-[A-Za-z0-9_]+\.js$/],
    budget: 200 * KB,
    warn: 150 * KB,
  },
  {
    name: 'All CSS',
    include: [/\.css$/],
    budget: 100 * KB,
    warn: 60 * KB,
  },
  {
    name: 'Chart route (heaviest)',
    include: [/TradePage-[A-Za-z0-9_]+\.js/, /TradingChart-[A-Za-z0-9_]+\.js/],
    budget: 700 * KB,
    warn: 600 * KB,
  },
  {
    name: 'All JS combined',
    include: [/\.js$/],
    budget: 1500 * KB,
    warn: 1200 * KB,
  },
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(abs))
    else if (entry.isFile()) out.push(abs)
  }
  return out
}

function fmt(bytes) {
  if (bytes < KB) return `${bytes} B`
  if (bytes < 1000 * KB) return `${(bytes / KB).toFixed(1)} KB`
  return `${(bytes / KB / KB).toFixed(2)} MB`
}

function pct(n) {
  return `${Math.round(n * 100)}%`
}

function main() {
  try {
    statSync(DIST)
  } catch {
    console.error(`[size] dist/ not found at ${DIST}`)
    console.error('[size] Run `pnpm build` first.')
    process.exit(1)
  }

  const allFiles = walk(DIST).map(f => ({
    rel: relative(DIST, f).split(sep).join('/'),
    size: statSync(f).size,
  }))
  const strict = process.env.BUDGET_STRICT === '1'

  let failed = 0
  let warned = 0

  console.log('')
  console.log('Bundle size budgets')
  console.log('-'.repeat(60))

  for (const bucket of BUCKETS) {
    const matched = allFiles.filter(f =>
      bucket.include.some(rx => rx.test(f.rel)) &&
      !(bucket.exclude ?? []).some(rx => rx.test(f.rel)),
    )
    const total = matched.reduce((s, f) => s + f.size, 0)
    const ratio = bucket.budget > 0 ? total / bucket.budget : 0
    const overBudget = total > bucket.budget
    const overWarn = bucket.warn != null && total > bucket.warn

    const icon = overBudget ? 'X' : overWarn ? '!' : 'OK'
    console.log(`[${icon}] ${bucket.name.padEnd(28)} ${fmt(total).padStart(10)} / ${fmt(bucket.budget).padStart(10)} (${pct(ratio).padStart(4)})  · ${matched.length} file${matched.length === 1 ? '' : 's'}`)
    if (matched.length > 0 && (overBudget || overWarn)) {
      for (const f of matched.slice(0, 5)) {
        console.log(`         · ${f.rel}  ${fmt(f.size)}`)
      }
      if (matched.length > 5) {
        console.log(`         · ... and ${matched.length - 5} more`)
      }
    }

    if (overBudget) failed += 1
    else if (overWarn) warned += 1
  }

  console.log('-'.repeat(60))
  if (failed > 0) {
    console.log(`Failed: ${failed} bucket${failed === 1 ? '' : 's'} over hard budget.`)
    process.exit(1)
  } else if (warned > 0 && strict) {
    console.log(`Strict mode: ${warned} bucket${warned === 1 ? '' : 's'} over soft warning threshold. Failing.`)
    process.exit(1)
  } else if (warned > 0) {
    console.log(`Note: ${warned} bucket${warned === 1 ? '' : 's'} over soft warning threshold (set BUDGET_STRICT=1 to fail).`)
  } else {
    console.log('All buckets within budget.')
  }
}

main()
