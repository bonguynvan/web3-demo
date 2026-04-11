import { test, expect } from '@playwright/test'

test.describe('App loads', () => {
  test('renders the trading layout with header and chart', async ({ page }) => {
    await page.goto('/')

    // Header should be visible with logo
    await expect(page.locator('header')).toBeVisible()

    // Market selector should show a perp market
    await expect(page.getByText(/ETH-PERP|BTC-PERP/).first()).toBeVisible()

    // Chart area should exist
    await expect(page.locator('[class*="min-h-"]').first()).toBeVisible()
  })

  test('shows demo mode by default', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Demo toggle hidden in drawer on mobile')
    await page.goto('/')

    const demoButton = page.getByRole('button', { name: 'Demo', exact: true })
    await expect(demoButton).toBeVisible()
  })

  test('has trade/spot/pool tabs', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Trade panel tabs not visible on mobile — accessed via bottom CTA')
    await page.goto('/')

    await expect(page.getByRole('button', { name: /^trade$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^spot$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^pool$/i })).toBeVisible()
  })
})
