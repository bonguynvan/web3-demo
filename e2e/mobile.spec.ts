import { test, expect } from '@playwright/test'

test.describe('Mobile layout', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Mobile tests run on Chromium only')

  test('trade page shows chart and bottom CTA', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Desktop skips mobile tests')
    await page.goto('/trade')
    await expect(page.getByRole('button', { name: /long/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /short/i })).toBeVisible()
  })

  test('swap page works on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Desktop skips mobile tests')
    await page.goto('/swap')
    await expect(page.getByText(/you pay/i)).toBeVisible()
  })

  test('earn page works on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Desktop skips mobile tests')
    await page.goto('/earn')
    await expect(page.getByText(/supply/i).first()).toBeVisible()
  })

  test('portfolio page works on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Desktop skips mobile tests')
    await page.goto('/portfolio')
    // Should show connect wallet or portfolio content
    await expect(page.getByText(/connect wallet|total equity/i)).toBeVisible()
  })
})
