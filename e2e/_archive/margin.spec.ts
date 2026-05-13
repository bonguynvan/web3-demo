import { test, expect } from '@playwright/test'

test.describe('Margin trading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/earn')
    // Margin tab is default on /earn
    await page.getByText(/supply/i).first().waitFor()
  })

  test('opens margin panel with action tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^supply$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^borrow$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^repay$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^withdraw$/i })).toBeVisible()
  })

  test('shows asset selector with USDC default', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: /USD Coin/ }).first()).toBeVisible()
  })

  test('can switch between actions', async ({ page }) => {
    await page.getByRole('button', { name: /^borrow$/i }).click()
    await expect(page.getByPlaceholder('0.0')).toBeVisible()
  })

  test('can enter an amount', async ({ page }) => {
    const input = page.getByPlaceholder('0.0')
    await input.fill('100')
    await expect(input).toHaveValue('100')
  })

  test('can select different assets', async ({ page }) => {
    const assetSelector = page.locator('button').filter({ hasText: /USDC.*USD Coin/ })
    await assetSelector.click()
    const wethOption = page.locator('button').filter({ hasText: /WETH.*Wrapped Ether/ })
    await expect(wethOption).toBeVisible()
    await wethOption.click()
  })

  test('shows empty position card', async ({ page }) => {
    await expect(page.getByText(/supply collateral|no aave positions/i)).toBeVisible()
  })

  test('can switch to Pool tab', async ({ page }) => {
    await page.getByRole('button', { name: /^pool$/i }).click()
    // Pool panel should show deposit/withdraw
    await expect(page.getByText(/deposit|pool liquidity/i).first()).toBeVisible()
  })
})
