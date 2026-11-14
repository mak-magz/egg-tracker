import { randomUUID } from 'node:crypto'
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'

const ORIGIN = 'http://localhost:3000'

/** Fails the test on a page error, console.error or any Vue warning (a warning is logged with console.warn). */
export const test = base.extend<{
  consoleErrors: string[]
  allowedHttpPatterns: Array<string | RegExp>
}>({
  allowedHttpPatterns: [[], { option: true }],
  consoleErrors: [async ({ page, allowedHttpPatterns }, use) => {
    const errors: string[] = []
    // The Nuxt dev overlay sits on top of the page and intercepts clicks on mobile.
    await page.addInitScript(() => {
      const style = document.createElement('style')
      style.textContent = '#nuxt-devtools-container{display:none!important}'
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
    })
    page.on('response', (r) => {
      if (r.status() >= 400) {
        const url = r.url()
        const allowed = allowedHttpPatterns.some(p => typeof p === 'string' ? url.includes(p) : p.test(url))
        if (!allowed) errors.push(`http ${r.status()}: ${r.request().method()} ${url}`)
      }
    })
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`))
    page.on('console', (m) => {
      const text = m.text()
      if ((m.type() === 'error' && !text.startsWith('Failed to load resource')) || text.includes('[Vue warn]')) errors.push(`console.${m.type()}: ${text}`)
    })
    await use(errors)
    expect(errors, 'browser console errors / Vue warnings').toEqual([])
  }, { auto: true }],
})
export { expect }

async function api<T>(request: APIRequestContext, method: 'GET' | 'POST', path: string, data?: unknown): Promise<T> {
  const res = await request.fetch(`${ORIGIN}${path}`, {
    method,
    headers: { 'Origin': ORIGIN, 'Content-Type': 'application/json' },
    data: data === undefined ? undefined : JSON.stringify(data),
  })
  if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()}`)
  return await res.json() as T
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface Seeded { clientName: string, saleId: string, saleNumber: number | string, orderId: string, orderNumber: number | string }

/** Seeds one client, stock, a sale and an open order through the real routes (same-origin Origin header for the CSRF guard). */
export async function seed(page: Page): Promise<Seeded> {
  const r = page.request
  const { sizes } = await api<{ sizes: { id: string, archived?: boolean, active?: boolean }[] }>(r, 'GET', '/api/sizes')
  const sizeId = sizes[0]!.id
  const clientName = `E2E Client ${randomUUID().slice(0, 6)}`
  const added = await api<{ client: { id: string } }>(r, 'POST', '/api/clients', { submissionId: randomUUID(), name: clientName, defaultPrice: 250 })
  const clientId = added.client.id
  await api(r, 'POST', '/api/production/entries', { submissionId: randomUUID(), date: today(), good: [{ sizeId, eggs: 600 }], rejects: 0 })
  const sale = await api<{ sale: { id: string, saleNumber: number | string } }>(r, 'POST', '/api/sales', {
    submissionId: randomUUID(), type: 'delivery', saleDate: today(), clientId, lines: [{ sizeId, eggs: 60, pricePerTray: 250 }],
  })
  const order = await api<{ order: { id: string, orderNumber: number | string } }>(r, 'POST', '/api/orders', {
    submissionId: randomUUID(), clientId, orderDate: today(), lines: [{ sizeId, eggs: 90, pricePerTray: 250 }],
  })

  // Ensure browser context is on the app origin so OPFS worker exists, then hydrate seeded snapshot into local OPFS.
  if (page.url() === 'about:blank') {
    await page.goto('/farm')
  }
  const snapshotRes = await api<{ snapshot: unknown, latestVersion: number }>(r, 'GET', '/api/sync/snapshot').catch(() => null)
  if (snapshotRes?.snapshot) {
    await page.waitForFunction(() => Boolean((window as unknown as { __tamagoLocalWorker?: unknown }).__tamagoLocalWorker))
    await page.evaluate(async ({ snap, ver }) => {
      const w = (window as unknown as {
        __tamagoLocalWorker?: { importSnapshot: (s: unknown, v: number, opts?: Record<string, unknown>) => Promise<unknown> }
      }).__tamagoLocalWorker
      if (w) await w.importSnapshot(snap, ver, { tier: 'premium' })
    }, { snap: snapshotRes.snapshot, ver: snapshotRes.latestVersion })
  }

  return { clientName, saleId: sale.sale.id, saleNumber: sale.sale.saleNumber, orderId: order.order.id, orderNumber: order.order.orderNumber }
}
