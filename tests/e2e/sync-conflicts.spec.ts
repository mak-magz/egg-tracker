import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

test.use({
  allowedHttpPatterns: ['/api/sync/snapshot'],
})

async function onboardFreeAndLogLargeTray(page: Page) {
  await page.goto('/')
  await page.waitForURL(u => u.pathname === '/welcome' || u.pathname.startsWith('/farm'), { timeout: 15_000 })
  if (page.url().includes('/welcome')) {
    await page.getByRole('button', { name: /start tracking/i }).click()
    await page.waitForURL('**/farm**', { timeout: 15_000 })
  }

  await page.goto('/farm/production')
  await page.getByRole('button', { name: /add production|log production/i }).first().click()
  await page.getByRole('button', { name: 'Increase Large trays' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('[data-day]').first()).toContainText('1 tray')
}

test.describe('Feature 12: Upgrade Snapshot Retry & Sync Conflicts UI', () => {
  test('UpgradeModal blocks tier flip on snapshot upload 500 error and recovers on Retry Upload', async ({ browser }) => {
    const ts = Date.now()
    const email = `upgrade-retry-${ts}@example.com`
    const password = 'TestPassword123!'

    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await onboardFreeAndLogLargeTray(page)

    await page.goto('/farm/settings')
    await page.getByRole('button', { name: /upgrade to cloud/i }).click()

    // Inject failure on first POST /api/sync/snapshot only
    let snapshotFailRemaining = 1
    await page.route('**/api/sync/snapshot', async (route) => {
      if (route.request().method() === 'POST' && snapshotFailRemaining > 0) {
        snapshotFailRemaining--
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Simulated upload failure' }),
        })
        return
      }
      await route.continue()
    })

    await page.getByPlaceholder('e.g. Sunrise Farm').fill(`Retry Farm ${ts}`)
    await page.getByPlaceholder('owner@example.com').fill(email)
    await page.getByPlaceholder('Min 8 characters').fill(password)
    await page.getByRole('button', { name: /create & sync/i }).click()

    await expect(page.getByText(/could not upload farm data to the cloud/i)).toBeVisible({ timeout: 15_000 })
    const retryBtn = page.getByRole('button', { name: /retry upload/i })
    await expect(retryBtn).toBeVisible()

    // Ensure tier cookie stayed 'free' while snapshot failed
    const cookiesBeforeRetry = await ctx.cookies('http://localhost:3000')
    const tierCookieBefore = cookiesBeforeRetry.find(c => c.name === 'tamago_tier')?.value
    expect(tierCookieBefore ?? 'free').toBe('free')

    // Retry succeeds cleanly without creating duplicate tenant
    await retryBtn.click()
    await expect(page.getByText('Upgraded to Cloud Sync', { exact: true })).toBeVisible({ timeout: 15_000 })

    const cookiesAfterRetry = await ctx.cookies('http://localhost:3000')
    expect(cookiesAfterRetry.find(c => c.name === 'tamago_tier')?.value).toBe('premium')

    await ctx.close()
  })

  test('SyncStatusPill, conflict banner, and SyncConflictsModal handle push rejection and discard reconciliation', async ({ browser }) => {
    const ts = Date.now()
    const email = `conflicts-e2e-${ts}@example.com`
    const password = 'TestPassword123!'

    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await onboardFreeAndLogLargeTray(page)

    // Upgrade cleanly first
    await page.goto('/farm/settings')
    await page.getByRole('button', { name: /upgrade to cloud/i }).click()
    await page.getByPlaceholder('e.g. Sunrise Farm').fill(`Conflict Farm ${ts}`)
    await page.getByPlaceholder('owner@example.com').fill(email)
    await page.getByPlaceholder('Min 8 characters').fill(password)
    await page.getByRole('button', { name: /create & sync/i }).click()
    await expect(page.getByText('Upgraded to Cloud Sync', { exact: true })).toBeVisible({ timeout: 15_000 })

    await page.goto('/farm/production')

    // Reject the next POST /api/sync/push mutation cleanly so SyncEngine marks it 'failed' locally
    let failPushOnce = true
    await page.route('**/api/sync/push', async (route) => {
      if (route.request().method() === 'POST' && failPushOnce) {
        const postData = route.request().postDataJSON() as { mutations?: Array<{ id: string }> } | null
        const ids = (postData?.mutations || []).map(m => m.id)
        if (ids.length > 0) {
          failPushOnce = false
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              results: ids.map(id => ({
                id,
                status: 'rejected',
                version: 0,
                error: 'TM050 Insufficient stock',
              })),
              latestVersion: 0,
            }),
          })
          return
        }
      }
      await route.continue()
    })

    // Log another tray (Medium) which gets pushed & rejected once
    await page.getByRole('button', { name: /add production|log production/i }).first().click()
    await page.getByRole('button', { name: 'Increase Medium trays' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    // Trigger manual Sync Now via SyncStatusPill popover so test doesn't wait 20s poll interval
    const syncBtn = page.getByRole('button', { name: 'Sync status' })
    await syncBtn.click()
    const syncNowBtn = page.getByRole('button', { name: /sync now/i })
    if (await syncNowBtn.isVisible()) {
      await syncNowBtn.click()
    }
    const closePopoverBtn = page.getByRole('button', { name: 'Close popover' })
    if (await closePopoverBtn.isVisible()) {
      await closePopoverBtn.click()
    }

    // Banner and conflict UI appear
    const reviewBannerBtn = page.getByRole('button', { name: /review issues/i })
    await expect(reviewBannerBtn).toBeVisible({ timeout: 15_000 })
    await reviewBannerBtn.click()

    const modalHeading = page.getByRole('heading', { name: /sync issues/i })
    await expect(modalHeading).toBeVisible()
    await expect(page.getByText(/not enough eggs in stock/i)).toBeVisible()

    // Verify no horizontal overflow on SyncConflictsModal
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)

    // Discard with inline 2-step confirmation -> reconciles from cloud snapshot -> resolved state
    await page.getByRole('button', { name: 'Discard', exact: true }).first().click()
    await expect(page.getByText(/discard unsynced change\?/i)).toBeVisible()
    await page.getByRole('button', { name: /discard change/i }).click()

    await expect(page.getByText(/all sync issues resolved!/i)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(modalHeading).toBeHidden()
    await expect(reviewBannerBtn).toBeHidden()

    // Production view rebalanced back to cloud snapshot (1 tray Large only, discarded Medium gone)
    await expect(page.locator('[data-day]').first()).toContainText('1 tray')
    await expect(page.locator('[data-day]').first()).not.toContainText('Medium')

    await ctx.close()
  })
})
