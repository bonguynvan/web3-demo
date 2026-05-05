#!/usr/bin/env node
/**
 * generate-assets — call fal.ai (Flux Pro 1.1 Ultra) to produce the
 * landing-page hero background and the OG social card, then download
 * both into public/.
 *
 * Usage:
 *   FAL_KEY=fal_xxxxxxxxxxxxxxxx pnpm gen:assets
 *
 * The key never leaves your machine — this script reads it from the
 * environment and uses it for HTTPS calls to fal.run only.
 *
 * Re-run any time the brand evolves; existing files are overwritten.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

const KEY = process.env.FAL_KEY
if (!KEY) {
  console.error('FAL_KEY env var is required.')
  console.error('Usage: FAL_KEY=fal_xxxx pnpm gen:assets')
  process.exit(1)
}

const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux-pro/v1.1-ultra'

const BRAND_PROMPT_BASE =
  'abstract candlestick price action chart, deep near-black background, ' +
  'electric amber #ffb547 accent on a single rising wick, fine grid lines, ' +
  'cinematic depth of field, minimal, editorial, atmospheric. ' +
  'No text, no UI, no human figures, no logos, no coins, no glossy plastic.'

const NEGATIVE =
  'people, faces, hands, text, logos, plastic, glossy, photorealistic crypto coins, ' +
  '3d render, cartoon, illustration with characters, neon overload, watermark'

const ASSETS = [
  // ─── Hero / atmospheric ─────────────────────────────────────────────
  {
    name: 'hero-bg.png',
    aspect_ratio: '16:9',
    prompt: BRAND_PROMPT_BASE +
      ' Composition: wide horizon line bisects frame; sparkline rises from lower-left, breaks upward at golden ratio. ' +
      'High contrast, suitable for a 60% surface-color overlay so text remains readable.',
  },

  // ─── Social cards ───────────────────────────────────────────────────
  {
    name: 'og.png',
    aspect_ratio: '16:9',
    prompt: BRAND_PROMPT_BASE +
      ' Composition: square-ish vignette suitable for social cards. ' +
      'Single bold ascending sparkline with one prominent target dot at peak; balanced negative space ' +
      'in the upper-left for typography overlay added later.',
  },
  {
    name: 'proof-og.png',
    aspect_ratio: '16:9',
    prompt: BRAND_PROMPT_BASE +
      ' Composition: scientific instrument vibe — fine grid lines like a research notebook, ' +
      'a single chart line with subtle vertical tick marks suggesting timestamped events. ' +
      'Sense of receipts being kept, an audit trail. Negative space upper-left for the headline.',
  },

  // ─── Section divider / accents ─────────────────────────────────────
  {
    name: 'section-divider.png',
    aspect_ratio: '21:9',
    prompt: 'ultra-thin horizontal sparkline drifting across a deep near-black void, ' +
      'electric amber #ffb547 single accent point breaking the line, ' +
      'minimal, almost a horizontal rule with character. ' +
      'No text, no UI, no people. Subtle, atmospheric, suitable as a thin section divider.',
  },

  // ─── Empty-state illustrations ─────────────────────────────────────
  // Used as soft visual anchors when a list/page has no data yet.
  {
    name: 'library-empty.png',
    aspect_ratio: '1:1',
    prompt: 'minimal abstract illustration, deep near-black background, electric amber accent, ' +
      'an open book silhouette dissolving into chart sparklines flowing rightward. ' +
      'Editorial style, lots of negative space, no text, no people, no UI. ' +
      'Suggests a library where every entry is a price strategy.',
  },
  {
    name: 'portfolio-empty.png',
    aspect_ratio: '1:1',
    prompt: 'minimal abstract illustration, deep near-black background, electric amber accent, ' +
      'three thin overlapping equity curves sketched faintly, suggesting a portfolio yet to be built. ' +
      'Editorial, lots of negative space, no text, no people, no UI.',
  },
  {
    name: 'signals-empty.png',
    aspect_ratio: '1:1',
    prompt: 'minimal abstract illustration, deep near-black background, electric amber accent, ' +
      'a single small target dot at the end of a faint dotted reach line, suggesting a signal awaiting fire. ' +
      'Editorial, lots of negative space, no text, no people, no UI.',
  },
]

async function generate(asset) {
  console.log(`[fal.ai] generating ${asset.name} (${asset.aspect_ratio})…`)

  const res = await fetch(FAL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: asset.prompt,
      negative_prompt: NEGATIVE,
      aspect_ratio: asset.aspect_ratio,
      num_images: 1,
      output_format: 'png',
      enable_safety_checker: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`fal.ai responded ${res.status}: ${body.slice(0, 400)}`)
  }

  const json = await res.json()
  const url = json?.images?.[0]?.url
  if (!url) {
    throw new Error(`fal.ai response missing images[0].url: ${JSON.stringify(json).slice(0, 400)}`)
  }

  console.log(`  ↓ downloading ${url.slice(0, 80)}…`)
  const imgRes = await fetch(url)
  if (!imgRes.ok) throw new Error(`download failed: ${imgRes.status}`)
  const buf = Buffer.from(await imgRes.arrayBuffer())

  const out = join(PUBLIC_DIR, asset.name)
  await writeFile(out, buf)
  console.log(`  ✓ saved → public/${asset.name} (${(buf.length / 1024).toFixed(0)} KB)`)
  return out
}

async function main() {
  if (!existsSync(PUBLIC_DIR)) await mkdir(PUBLIC_DIR, { recursive: true })

  for (const asset of ASSETS) {
    try {
      await generate(asset)
    } catch (err) {
      console.error(`[fal.ai] FAILED ${asset.name}:`, err.message)
      process.exitCode = 1
    }
  }

  console.log('\nDone. Reminder: compress further with TinyPNG or `cwebp` if hero-bg.png exceeds 200 KB.')
  console.log('LandingPage will pick up `/hero-bg.png` automatically once it exists.')
}

main()
