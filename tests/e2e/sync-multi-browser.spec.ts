import { test, expect } from './fixtures'

test.describe('Multi-Browser Sync: Production Duplication Regression', () => {
  test('Device 1 logs 1 tray, upgrades to Cloud; Device 2 logs in and shows strictly 1 tray (not 2 trays)', async ({ browser }) => {
    // Generate unique user credentials for this test execution
    const timestamp = Date.now()
    const email = `sync-e2e-${timestamp}@example.com`
    const password = 'TestPassword123!'
    const farmName = `Sync Farm ${timestamp}`

    // -----------------------------------------------------------------------------------
    // CONTEXT 1: Browser 1 (Free / Local-Only Device)
    // -----------------------------------------------------------------------------------
    const context1 = await browser.newContext({ storageState: undefined })
    const page1 = await context1.newPage()

    await page1.goto('/')

    // Complete first-run welcome if routed to /welcome
    if (page1.url().includes('/welcome')) {
      const startBtn = page1.getByRole('button', { name: /start tracking/i })
      if (await startBtn.isVisible()) {
        await startBtn.click()
        await page1.waitForURL('**/farm**')
      }
    }

    // 1. Navigate to Production screen
    await page1.goto('/farm/production')

    // 2. Open Log Production form
    const logBtn = page1.getByRole('button', { name: /add production|log production/i }).first()
    await expect(logBtn).toBeVisible()
    await logBtn.click()
    await expect(page1.getByRole('heading', { name: /log production/i })).toBeVisible()

    // 3. Fill 1 tray for Large eggs and save
    const trayInput = page1.getByRole('spinbutton', { name: /large trays/i }).or(page1.getByLabel(/large trays/i)).first()
    await expect(trayInput).toBeVisible()
    await trayInput.fill('1')
    await page1.getByRole('button', { name: 'Save', exact: true }).click()

    // Verify day card in Browser 1 shows strictly 1 tray
    const dayCard1 = page1.locator('[data-day]').first()
    await expect(dayCard1).toBeVisible()
    await expect(dayCard1).toContainText('1 tray')
    await expect(dayCard1).not.toContainText('2 trays')

    // 4. Navigate to Settings and trigger Cloud Upgrade
    await page1.goto('/farm/settings')
    const upgradeBtn = page1.getByRole('button', { name: /upgrade to cloud/i })
    await expect(upgradeBtn).toBeVisible()
    await upgradeBtn.click()

    // Fill UpgradeModal registration form
    await expect(page1.getByRole('heading', { name: /upgrade to cloud/i })).toBeVisible()
    await page1.getByPlaceholder('e.g. Sunrise Farm').fill(farmName)
    await page1.getByPlaceholder('owner@example.com').fill(email)
    await page1.getByPlaceholder('Min 8 characters').fill(password)
    await page1.getByRole('button', { name: /create & sync|upgrade/i }).click()

    // Wait for successful upgrade toast and sync pill indicator
    await expect(page1.getByText(/upgraded to cloud sync/i)).toBeVisible({ timeout: 15000 })
    await expect(page1.getByText('Cloud synced')).toBeVisible({ timeout: 15000 })

    // -----------------------------------------------------------------------------------
    // CONTEXT 2: Browser 2 (Fresh Secondary Device / Clean Session)
    // -----------------------------------------------------------------------------------
    const context2 = await browser.newContext({ storageState: undefined })
    const page2 = await context2.newPage()

    // 1. Go to /login and authenticate with the newly created account
    await page2.goto('/login')
    await page2.getByLabel('Email').fill(email)
    await page2.getByLabel('Password').fill(password)
    await page2.getByRole('button', { name: /sign in/i }).click()

    // 2. Verify redirect directly to /farm (no bouncing to /welcome)
    await page2.waitForURL('**/farm**', { timeout: 15000 })

    // 3. Navigate to Production screen on Device 2
    await page2.goto('/farm/production')

    // 4. Assert day card exists and holds strictly 1 tray (30 eggs), NOT 2 trays (60 eggs)
    const dayCard2 = page2.locator('[data-day]').first()
    await expect(dayCard2).toBeVisible({ timeout: 15000 })
    await expect(dayCard2).toContainText('1 tray')
    await expect(dayCard2).not.toContainText('2 trays')

    // 5. Allow background sync cycles to run and re-verify no duplication occurred
    await page2.waitForTimeout(2000)
    await expect(dayCard2).toContainText('1 tray')
    await expect(dayCard2).not.toContainText('2 trays')

    // Cleanup contexts
    await context1.close()
    await context2.close()
  })
})
