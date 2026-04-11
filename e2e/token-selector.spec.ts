import { test, expect } from '@playwright/test'

test.describe('Token selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^spot$/i }).click()
    await page.getByText(/you pay/i).waitFor()
  })

  test('opens token selector when clicking a token pill', async ({ page }) => {
    // The token pill is a rounded-full button inside the spot form
    // Scope to the "You Pay" area to avoid matching the header market selector
    const sellPill = page.locator('button.rounded-full').filter({ hasText: /ETH/ })
    await sellPill.click()

    // Modal should open
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible()
  })

  test('shows popular tokens in selector', async ({ page }) => {
    const sellPill = page.locator('button.rounded-full').filter({ hasText: /ETH/ })
    await sellPill.click()
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible()

    // Popular token pills should be visible in the modal
    const dialog = page.locator('[role="dialog"]')
    // Check for WETH in the popular tokens row (USDC matches USDC.e too)
    await expect(dialog.getByText('WETH', { exact: true }).first()).toBeVisible()
  })

  test('closes modal on Escape', async ({ page }) => {
    const sellPill = page.locator('button.rounded-full').filter({ hasText: /ETH/ })
    await sellPill.click()
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder(/search by name/i)).not.toBeVisible()
  })
})
