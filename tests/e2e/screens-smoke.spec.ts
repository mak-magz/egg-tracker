import { test, expect } from './fixtures'

for (const path of ['/production', '/sales', '/orders', '/inventory', '/clients', '/settings']) {
  test(`${path} loads with no console errors and no horizontal scroll`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator('main, [role="main"], h1').first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0)
  })
}
