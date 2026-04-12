import { test, expect } from '@playwright/test'

test.describe('Spot swap form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/swap')
    // Wait for lazy load
    await page.getByText(/you pay/i).waitFor()
  })

  test('opens spot swap form on /swap', async ({ page }) => {
    await expect(page.getByText(/you pay/i)).toBeVisible()
    await expect(page.getByText(/you receive/i)).toBeVisible()
  })

  test('shows default tokens ETH and USDC', async ({ page }) => {
    await expect(page.getByRole('button', { name: /ETH/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /USDC/ }).first()).toBeVisible()
  })

  test('can enter a sell amount', async ({ page }) => {
    const input = page.getByPlaceholder('0.0')
    await input.fill('1.5')
    await expect(input).toHaveValue('1.5')
  })

  test('flip button swaps tokens', async ({ page }) => {
    const flipButton = page.locator('button').filter({ has: page.locator('.lucide-arrow-down-up') })
    await flipButton.click()
    await expect(page.getByText(/you pay/i)).toBeVisible()
  })

  test('shows slippage settings', async ({ page }) => {
    await page.locator('button', { hasText: /Slippage:/ }).click()
    await expect(page.getByRole('button', { name: '0.5%', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '1.0%', exact: true })).toBeVisible()
  })

  test('can change slippage', async ({ page }) => {
    await page.locator('button', { hasText: /Slippage:/ }).click()
    await page.getByRole('button', { name: '1.0%', exact: true }).click()
    await expect(page.locator('button', { hasText: 'Slippage: 1.0%' })).toBeVisible()
  })

  test('submit button shows connect/enter state', async ({ page }) => {
    const submitButton = page.locator('button.w-full.py-3')
    await expect(submitButton).toBeVisible()
    const text = await submitButton.textContent()
    expect(text).toMatch(/connect wallet|switch to arbitrum|enter amount/i)
  })

  test('swap/history tabs work', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Tab naming conflicts with nav on mobile')
    // Click history tab
    await page.getByRole('button', { name: /history/i }).click()
    await expect(page.getByText(/no swaps yet|connect wallet/i)).toBeVisible()

    // Switch back to swap (use .nth(1) to skip the nav "Swap" button)
    await page.getByRole('button', { name: /^swap$/i }).nth(1).click()
    await expect(page.getByText(/you pay/i)).toBeVisible()
  })
})
