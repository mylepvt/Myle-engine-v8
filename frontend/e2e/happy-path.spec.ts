import { expect, test } from '@playwright/test'

import { installE2eApiMocks } from './api-mocks'

test.describe('happy path (mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    await installE2eApiMocks(page)
  })

  test('dev login → dashboard home → leads → change stage', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /Myle Community/i })).toBeVisible()

    await page.getByRole('button', { name: /Continue with preview role/i }).click()

    await expect(page).toHaveURL(/\/dashboard\/?$/)
    await expect(page.getByRole('heading', { name: /welcome, e2e/i })).toBeVisible()

    await page.goto('/dashboard/work/leads')
    await expect(page).toHaveURL(/\/dashboard\/work\/leads\/?$/)

    const leadHeading = page.getByRole('heading', { name: 'E2E Lead' })
    await expect(leadHeading).toBeVisible()
    const card = leadHeading.locator(
      'xpath=ancestor::*[contains(concat(" ", @class, " "), " rounded-xl ")][1]',
    )
    const statusSelect = card.getByLabel('Lead status')
    await statusSelect.selectOption('contacted')
    await expect(statusSelect).toHaveValue('contacted')
  })

  test('CTCS: dial + WhatsApp links; light / dark / glass screenshots', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /Continue with preview role/i }).click()
    await page.goto('/dashboard/work/leads')
    await expect(page.getByRole('heading', { name: 'E2E Lead' })).toBeVisible()

    const dial = page.getByRole('link', { name: 'Dial and log call' })
    const wa = page.getByRole('link', { name: 'Open WhatsApp chat' })
    await expect(dial).toHaveAttribute('href', /^tel:\+919876543210$/)
    await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/919876543210$/)

    const setTheme = async (theme: 'light' | 'dark' | 'transparent') => {
      await page.evaluate((t) => {
        localStorage.setItem(
          'myle-ui-feedback',
          JSON.stringify({ state: { theme: t, satisfactionPoints: 0 }, version: 0 }),
        )
      }, theme)
      await page.reload()
      await expect(page.getByRole('heading', { name: 'E2E Lead' })).toBeVisible()
    }

    await setTheme('light')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.locator('html')).not.toHaveClass(/theme-transparent/)
    await page.screenshot({ path: 'test-results/ctcs-theme-light.png', fullPage: true })

    await setTheme('dark')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.screenshot({ path: 'test-results/ctcs-theme-dark.png', fullPage: true })

    await setTheme('transparent')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.locator('html')).toHaveClass(/theme-transparent/)
    await page.screenshot({ path: 'test-results/ctcs-theme-glass.png', fullPage: true })
  })
})
