import { test, expect } from '@playwright/test'

test.describe('Spot swap form', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    await page.goto('/')
    if (isMobile) {
      // On mobile, tap the Spot button in the bottom CTA bar
      await page.getByRole('button', { name: /spot/i }).click()
    } else {
      // On desktop, click the Spot tab in the TradePanel
      await page.getByRole('button', { name: /^spot$/i }).click()
    }
    // Wait for lazy load — "You Pay" label appears when form is ready
    await page.getByText(/you pay/i).waitFor()
  })

  test('opens spot swap form when clicking Spot tab', async ({ page }) => {
    await expect(page.getByText(/you pay/i)).toBeVisible()
    await expect(page.getByText(/you receive/i)).toBeVisible()
  })

  test('shows default tokens ETH and USDC', async ({ page }) => {
    // Token pills contain icon letter + symbol, e.g. "E ETH"
    await expect(page.getByRole('button', { name: /ETH/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /USDC/ }).first()).toBeVisible()
  })

  test('can enter a sell amount', async ({ page }) => {
    const input = page.getByPlaceholder('0.0')
    await input.fill('1.5')
    await expect(input).toHaveValue('1.5')
  })

  test('flip button swaps tokens', async ({ page }) => {
    // The flip button is the small circular button between pay/receive
    // It contains the ArrowDownUp SVG icon
    const flipButton = page.locator('button').filter({ has: page.locator('.lucide-arrow-down-up') })
    await flipButton.click()

    // After flip the form should still be visible (no crash)
    await expect(page.getByText(/you pay/i)).toBeVisible()
  })

  test('shows slippage settings', async ({ page }) => {
    // Click the slippage toggle button (contains "Slippage:" text)
    await page.locator('button', { hasText: /Slippage:/ }).click()

    // Slippage preset buttons should appear
    await expect(page.getByRole('button', { name: '0.5%', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '1.0%', exact: true })).toBeVisible()
  })

  test('can change slippage', async ({ page }) => {
    await page.locator('button', { hasText: /Slippage:/ }).click()
    await page.getByRole('button', { name: '1.0%' }).click()

    // Slippage display should update
    await expect(page.locator('button', { hasText: 'Slippage: 1.0%' })).toBeVisible()
  })

  test('submit button shows connect/enter state', async ({ page }) => {
    // Without wallet connected on Arbitrum, button should show
    // either "Connect Wallet", "Switch to Arbitrum", or "Enter Amount"
    const submitButton = page.locator('button.w-full.py-3')
    await expect(submitButton).toBeVisible()
    const text = await submitButton.textContent()
    expect(text).toMatch(/connect wallet|switch to arbitrum|enter amount/i)
  })

  test('swap/history sub-tabs work', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Sub-tabs not in mobile spot modal')
    // The spot sub-tabs: "swap" and "history"
    // Use .nth(1) to get the spot history sub-tab (not the perp history tab)
    const historyTab = page.getByRole('button', { name: /^history$/i }).last()
    await historyTab.click()

    // Should show empty history state
    await expect(page.getByText(/no swaps yet/i)).toBeVisible()

    // Switch back to swap
    const swapTab = page.getByRole('button', { name: /^swap$/i })
    await swapTab.click()

    // Should show the swap form again
    await expect(page.getByText(/you pay/i)).toBeVisible()
  })
})
