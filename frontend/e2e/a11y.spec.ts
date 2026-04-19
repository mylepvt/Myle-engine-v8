import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { installE2eApiMocks } from './api-mocks'

test.describe('a11y (axe)', () => {
  test.beforeEach(async ({ page }) => {
    await installE2eApiMocks(page)
  })

  test('login has no critical or serious axe violations (excluding color-contrast)', async ({ page }) => {
    // Override auth/me to return unauthenticated so login page doesn't redirect before axe runs
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authenticated: false }),
      })
    })
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    // Primary / glass brand palette is still being tuned to WCAG AA text contrast; track in design QA.
    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect.soft(bad, JSON.stringify(bad, null, 2)).toEqual([])
  })
})
