import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './fixtures'

async function onboardFreeDevice(page: Page) {
  await page.goto('/')
  await page.waitForURL(u => u.pathname === '/welcome' || u.pathname.startsWith('/farm'), { timeout: 15_000 })
  if (page.url().includes('/welcome')) {
    const startBtn = page.getByRole('button', { name: /start tracking/i })
    await expect(startBtn).toBeVisible()
    await startBtn.click()
    await page.waitForURL('**/farm**', { timeout: 15_000 })
  }
}

async function setupCloudAccount(context: BrowserContext, sizeBtnLabel: string, email: string, password: string) {
  const page = await context.newPage()
  await onboardFreeDevice(page)

  await page.goto('/farm/production')
  await page.getByRole('button', { name: /add production|log production/i }).first().click()
  await page.getByRole('button', { name: sizeBtnLabel }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('[data-day]').first()).toContainText('1 tray')

  await page.goto('/farm/settings')
  await page.getByRole('button', { name: /upgrade to cloud/i }).click()
  await page.getByPlaceholder('e.g. Sunrise Farm').fill(`Guard Farm ${Date.now()}`)
  await page.getByPlaceholder('owner@example.com').fill(email)
  await page.getByPlaceholder('Min 8 characters').fill(password)
  await page.getByRole('button', { name: /create & sync/i }).click()
  await expect(page.getByText('Upgraded to Cloud Sync', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.close()
}

test.describe('Feature 12: Multi-Device Overwrite Guard & Sign-Out Isolation', () => {
  test('warns on dirty Free device, allows backup + cancel preservation, replaces on confirm, and wipes OPFS on sign-out', async ({ browser }) => {
    const ts = Date.now()
    const email = `guard-e2e-${ts}@example.com`
    const password = 'TestPassword123!'

    // 1. Provision Cloud account with 1 tray Large
    const cloudCtx = await browser.newContext({ storageState: undefined })
    await setupCloudAccount(cloudCtx, 'Increase Large trays', email, password)
    await cloudCtx.close()

    // 2. Clean secondary browser has local Free production (2 trays Small)
    const deviceCtx = await browser.newContext({ storageState: undefined })
    const page = await deviceCtx.newPage()
    await onboardFreeDevice(page)

    await page.goto('/farm/production')
    await page.getByRole('button', { name: /add production|log production/i }).first().click()
    const incSmall = page.getByRole('button', { name: 'Increase Small trays' })
    await incSmall.click()
    await incSmall.click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('[data-day]').first()).toContainText('2 trays')

    // 3. Sign into Cloud account -> ConfirmReplaceLocalDialog blocks hydration
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.locator('input[type=password]').fill(password)
    await page.getByRole('button', { name: /^sign in$/i }).click()

    const replaceHeading = page.getByRole('heading', { name: /replace local farm data/i })
    await expect(replaceHeading).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('1 production day')).toBeVisible()

    // Verify no horizontal overflow on dialog (especially mobile 375px)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)

    // 4. Download JSON backup inside dialog (dialog stays open)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /download backup \(json\)/i }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.json$/i)
    await expect(page.getByRole('button', { name: /backup downloaded/i })).toBeVisible()

    // 5. Cancel -> keeps local Free data intact and signs Firebase back out
    await page.getByRole('button', { name: /cancel and keep local data/i }).click()
    await expect(replaceHeading).toBeHidden()
    await expect(page).toHaveURL(/\/login/)

    await page.getByRole('link', { name: /continue offline without signing in/i }).click()
    await page.waitForURL('**/farm**', { timeout: 15_000 })
    await page.goto('/farm/production')
    await expect(page.locator('[data-day]').first()).toContainText('2 trays')
    await expect(page.locator('[data-day]').first()).toContainText('Small')

    // 6. Sign in again and explicitly Confirm Replace
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.locator('input[type=password]').fill(password)
    await page.getByRole('button', { name: /^sign in$/i }).click()
    await expect(replaceHeading).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /replace local data with cloud/i }).click()
    await page.waitForURL('**/farm**', { timeout: 15_000 })
    await page.goto('/farm/production')
    await expect(page.locator('[data-day]').first()).toContainText('1 tray')
    await expect(page.locator('[data-day]').first()).toContainText('Large')
    await expect(page.locator('[data-day]').first()).not.toContainText('Small')

    // 7. Sign out -> OPFS wiped so shared-device offline entry sees empty farm
    await page.getByRole('button', { name: 'Account menu' }).first().click()
    await page.getByRole('menuitem', { name: /sign out/i }).click()
    await page.waitForURL('**/login**', { timeout: 15_000 })

    await page.getByRole('link', { name: /continue offline without signing in/i }).click()
    await page.waitForURL('**/farm**', { timeout: 15_000 })
    await page.goto('/farm/production')
    await expect(page.getByRole('heading', { name: /no production logged yet/i })).toBeVisible({ timeout: 15_000 })

    await deviceCtx.close()
  })

  test('pristine device bypasses confirmation dialog and hydrates cloud farm directly', async ({ browser }) => {
    const ts = Date.now()
    const email = `pristine-e2e-${ts}@example.com`
    const password = 'TestPassword123!'

    const cloudCtx = await browser.newContext({ storageState: undefined })
    await setupCloudAccount(cloudCtx, 'Increase Medium trays', email, password)
    await cloudCtx.close()

    const freshCtx = await browser.newContext({ storageState: undefined })
    const page = await freshCtx.newPage()
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.locator('input[type=password]').fill(password)
    await page.getByRole('button', { name: /^sign in$/i }).click()

    await page.waitForURL('**/farm**', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: /replace local farm data/i })).toHaveCount(0)
    await page.goto('/farm/production')
    await expect(page.locator('[data-day]').first()).toContainText('1 tray')
    await expect(page.locator('[data-day]').first()).toContainText('Medium')

    await freshCtx.close()
  })
})
