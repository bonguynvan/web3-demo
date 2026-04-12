import { test, expect } from '@playwright/test'

test.describe('App loads', () => {
  test('redirects / to /trade', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/trade/)
  })

  test('renders the trading layout with header and chart', async ({ page }) => {
    await page.goto('/trade')
    await expect(page.locator('header')).toBeVisible()
    await expect(page.getByText(/ETH-PERP|BTC-PERP/).first()).toBeVisible()
  })

  test('shows demo mode by default', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Demo toggle hidden in drawer on mobile')
    await page.goto('/trade')
    const demoButton = page.getByRole('button', { name: 'Demo', exact: true })
    await expect(demoButton).toBeVisible()
  })

  test('has navigation links', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Nav links hidden on mobile')
    await page.goto('/trade')
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('button', { name: 'Trade' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Swap' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Earn' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Portfolio' })).toBeVisible()
  })

  test('can navigate between pages', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Nav links hidden on mobile')
    await page.goto('/trade')

    const nav = page.getByRole('navigation')
    // Navigate to Swap
    await nav.getByRole('button', { name: 'Swap' }).click()
    await expect(page).toHaveURL(/\/swap/)

    // Navigate to Earn
    await nav.getByRole('button', { name: 'Earn' }).click()
    await expect(page).toHaveURL(/\/earn/)

    // Navigate to Portfolio
    await nav.getByRole('button', { name: 'Portfolio' }).click()
    await expect(page).toHaveURL(/\/portfolio/)

    // Back to Trade
    await nav.getByRole('button', { name: 'Trade' }).click()
    await expect(page).toHaveURL(/\/trade/)
  })
})
