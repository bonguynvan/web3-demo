import { test, expect } from '@playwright/test'

test.describe('Margin trading', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    await page.goto('/')
    if (isMobile) {
      // On mobile, tap the Margin button in the bottom CTA bar
      await page.getByRole('button', { name: /margin/i }).click()
    } else {
      // On desktop, click the Margin tab
      await page.getByRole('button', { name: /^margin$/i }).click()
    }
    // Wait for lazy load
    await page.getByText(/supply/i).first().waitFor()
  })

  test('opens margin panel with action tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^supply$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^borrow$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^repay$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^withdraw$/i })).toBeVisible()
  })

  test('shows asset selector with USDC default', async ({ page }) => {
    // The asset selector button contains "USDC" and "USD Coin"
    await expect(page.locator('button').filter({ hasText: /USD Coin/ }).first()).toBeVisible()
  })

  test('can switch between actions', async ({ page }) => {
    await page.getByRole('button', { name: /^borrow$/i }).click()
    // Amount input should be present
    await expect(page.getByPlaceholder('0.0')).toBeVisible()

    await page.getByRole('button', { name: /^repay$/i }).click()
    await expect(page.getByPlaceholder('0.0')).toBeVisible()
  })

  test('can enter an amount', async ({ page }) => {
    const input = page.getByPlaceholder('0.0')
    await input.fill('100')
    await expect(input).toHaveValue('100')
  })

  test('can select different assets', async ({ page }) => {
    // Click the asset selector dropdown button
    const assetSelector = page.locator('button').filter({ hasText: /USDC.*USD Coin/ })
    await assetSelector.click()

    // Dropdown should show WETH option
    const wethOption = page.locator('button').filter({ hasText: /WETH.*Wrapped Ether/ })
    await expect(wethOption).toBeVisible()

    // Select WETH
    await wethOption.click()
  })

  test('shows empty position card when not connected to Aave', async ({ page }) => {
    // Should show the deposit-to-start message
    await expect(page.getByText(/supply collateral|no aave positions/i)).toBeVisible()
  })

  test('submit button shows connect/enter state', async ({ page }) => {
    const submitButton = page.locator('button.w-full.py-3')
    await expect(submitButton).toBeVisible()
    const text = await submitButton.textContent()
    expect(text).toMatch(/connect wallet|switch to arbitrum|enter amount/i)
  })
})
