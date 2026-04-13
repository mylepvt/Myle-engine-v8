import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { installE2eApiMocks } from './api-mocks'

test.describe('a11y (axe)', () => {
  test.beforeEach(async ({ page }) => {
    await installE2eApiMocks(page)
  })

  test('login has no critical or serious axe violations (excluding color-contrast)', async ({ page }) => {
    await page.goto('/login')
    // Primary / glass brand palette is still being tuned to WCAG AA text contrast; track in design QA.
    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect.soft(bad, JSON.stringify(bad, null, 2)).toEqual([])
  })
})
