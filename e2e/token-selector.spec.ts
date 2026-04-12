import { test, expect } from '@playwright/test'

test.describe('Token selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/swap')
    await page.getByText(/you pay/i).waitFor()
  })

  test('opens token selector when clicking a token pill', async ({ page }) => {
    const sellPill = page.locator('button.rounded-full').filter({ hasText: /ETH/ })
    await sellPill.click()
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible()
  })

  test('shows popular tokens in selector', async ({ page }) => {
    const sellPill = page.locator('button.rounded-full').filter({ hasText: /ETH/ })
    await sellPill.click()
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible()
    const dialog = page.locator('[role="dialog"]')
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
