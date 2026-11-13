import { test, expect } from './fixtures'

for (const path of ['/farm', '/farm/production', '/farm/sales', '/farm/orders', '/farm/inventory', '/farm/clients', '/farm/settings']) {
  test(`${path} loads with no console errors and no horizontal scroll`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator('main, [role="main"], h1').first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0)
  })
}
