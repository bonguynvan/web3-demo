/**
 * smoke.spec.ts — post-pivot route audit.
 *
 * Goal: catch dumb regressions before they ship. Every public route loads,
 * renders its anchor heading, and doesn't throw uncaught errors in the
 * console. Splits into two suites:
 *
 *   describe('critical') — must pass. Failures block merges.
 *   describe('extra')    — informational. Captures interaction quirks
 *                          (dropdown open, search filter, skip-link).
 *
 * Each spec captures a screenshot tied to the test name so reviewers can
 * eyeball renders at all three project viewports without re-running.
 */

import { test, expect, type Page } from '@playwright/test'

// Routes the marketing + product surfaces actually expose post-pivot.
const PUBLIC_ROUTES: Array<{ path: string; titleRe: RegExp }> = [
  { path: '/',                  titleRe: /TradingDek/ },
  { path: '/proof',             titleRe: /track record|TradingDek/i },
  { path: '/library',           titleRe: /TradingDek/ },
  { path: '/learn',             titleRe: /TradingDek/ },
  { path: '/legal/disclaimer',  titleRe: /disclaimer|TradingDek/i },
  { path: '/legal/privacy',     titleRe: /privacy|TradingDek/i },
  { path: '/legal/terms',       titleRe: /terms|TradingDek/i },
  { path: '/404-does-not-exist',titleRe: /page not found|TradingDek/i },
]

const APP_ROUTES = ['/trade', '/portfolio', '/library', '/profile', '/bots']

async function gotoAndAssertNoCrash(page: Page, path: string) {
  // Only uncaught JS errors are blocking. Console errors (Binance CORS in
  // headless, missing dev OG images, vendor SDK warnings) are logged so the
  // reviewer sees them, but they don't fail the spec.
  const fatal: string[] = []
  const soft: string[] = []
  page.on('pageerror', e => fatal.push(`pageerror: ${e.message}`))
  page.on('console', msg => {
    if (msg.type() === 'error') soft.push(`console: ${msg.text()}`)
  })

  const res = await page.goto(path, { waitUntil: 'domcontentloaded' })
  expect(res, `no response at ${path}`).not.toBeNull()
  expect(res!.status(), `bad status at ${path}`).toBeLessThan(500)
  await page.waitForLoadState('networkidle').catch(() => {})

  if (soft.length) {
    console.log(`  ⚠ ${path}: ${soft.length} console errors (top 3):`)
    for (const s of soft.slice(0, 3)) console.log(`    ${s.slice(0, 200)}`)
  }
  expect(fatal, `uncaught errors on ${path}:\n${fatal.join('\n')}`).toEqual([])
}

test.describe('smoke / critical', () => {
  for (const { path, titleRe } of PUBLIC_ROUTES) {
    test(`loads ${path}`, async ({ page }, info) => {
      await gotoAndAssertNoCrash(page, path)
      await expect(page).toHaveTitle(titleRe)
      await page.screenshot({
        path: `test-results/screens/${info.project.name}/${slug(path)}.png`,
        fullPage: true,
      })
    })
  }

  for (const path of APP_ROUTES) {
    test(`app shell loads ${path}`, async ({ page }, info) => {
      await gotoAndAssertNoCrash(page, path)
      await expect(page.locator('#main-content')).toBeAttached()
      await page.screenshot({
        path: `test-results/screens/${info.project.name}${slug(path)}.png`,
        fullPage: true,
      })
    })
  }
})

test.describe('smoke / extra', () => {
  test('market dropdown opens and switches pair', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'header dropdown hidden in mobile-bar layout')
    await page.goto('/trade')
    await page.waitForLoadState('networkidle').catch(() => {})

    // Pair-dropdown trigger contains a market symbol like BTC/USDT or BTC-PERP.
    // The first chevron button is the venue switcher (Binance/Hyperliquid),
    // not the pair — so we filter by visible text shape.
    const trigger = page
      .locator('button')
      .filter({ hasText: /\b[A-Z0-9]{2,6}[/-](USDT|USDC|PERP)\b/ })
      .first()
    await trigger.click()
    // Wait briefly for menu to render. Headless Binance CORS may leave the
    // venue market list short — skip rather than fail when there aren't two
    // options to switch between.
    const options = page.getByRole('button').filter({ hasText: /USDT|PERP/ })
    const count = await options.count()
    test.skip(count < 2, `only ${count} market option(s) visible (Binance CORS blocked in headless)`)
    const before = (await trigger.textContent() ?? '').trim()
    // Find an option whose label differs from the current selection. The
    // currently-selected market appears in the menu too (highlighted), so
    // simply clicking nth(1) might re-pick the same pair.
    let clicked = false
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i)
      const txt = ((await opt.textContent()) ?? '').trim()
      // Visible-only check guards against the trigger button itself, which
      // is rendered next to the menu in the same DOM region.
      if (txt && !txt.startsWith(before.split(/\s/)[0]) && await opt.isVisible()) {
        await opt.click()
        clicked = true
        break
      }
    }
    test.skip(!clicked, 'no distinct market option found to switch to')
    const after = ((await trigger.textContent()) ?? '').trim()
    expect(after, 'pair did not change after dropdown click').not.toEqual(before)
  })

  test('library has a search input', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByPlaceholder(/search|filter/i).first()).toBeVisible()
  })

  test('skip-link surfaces on Tab', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'skip-link visual is desktop-keyboard only')
    await page.goto('/trade')
    await page.keyboard.press('Tab')
    await expect(page.getByText(/skip to content/i)).toBeVisible()
  })

  test('404 page renders branded chrome', async ({ page }) => {
    await page.goto('/this-route-truly-does-not-exist')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/doesn'?t exist/i)
    await expect(page.getByRole('link', { name: /workstation/i })).toBeVisible()
  })
})

function slug(p: string): string {
  return p.replace(/^\/+/, '/').replace(/\/+$/, '') || '/'
}
