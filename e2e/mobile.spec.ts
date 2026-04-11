import { test, expect } from '@playwright/test'

// These tests only run in the mobile-chrome project
test.describe('Mobile layout', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Mobile tests run on Chromium only')

  test('shows mobile layout with bottom CTA', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Desktop skips mobile tests')

    await page.goto('/')

    // Should show Long, Short, and Spot buttons at the bottom
    await expect(page.getByRole('button', { name: /long/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /short/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /spot/i })).toBeVisible()
  })

  test('opens spot modal from bottom CTA', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Desktop skips mobile tests')

    await page.goto('/')

    // Tap Spot button
    await page.getByRole('button', { name: /spot/i }).click()

    // Full-screen spot modal should open
    await expect(page.getByText(/spot swap/i)).toBeVisible()
    await expect(page.getByText(/you pay/i)).toBeVisible()
  })

  test('can close spot modal', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Desktop skips mobile tests')

    await page.goto('/')
    await page.getByRole('button', { name: /spot/i }).click()
    await expect(page.getByText(/spot swap/i)).toBeVisible()

    // Close button
    await page.getByRole('button', { name: /close/i }).click()
    await expect(page.getByText(/spot swap/i)).not.toBeVisible()
  })

  test('mobile tabs show positions/book/trades', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Desktop skips mobile tests')

    await page.goto('/')

    await expect(page.getByRole('button', { name: /positions/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /book/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /trades/i }).first()).toBeVisible()
  })
})
