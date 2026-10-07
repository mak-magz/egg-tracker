import { describe, expect, it } from 'vitest'
import type { Sale } from '../../shared/types/api'
import { buildInvoiceView, invoiceHeading, invoiceTitle } from '../../app/utils/invoice-view'
import type { InvoiceContext } from '../../app/utils/invoice-view'
import { resolveInvoice } from '../../app/utils/invoice-load'
import type { InvoiceDeps } from '../../app/utils/invoice-load'
import { formatPrice } from '../../shared/utils/price'

const sale: Sale = {
  id: '11111111-1111-4111-8111-111111111111',
  saleNumber: 1042,
  type: 'delivery',
  clientId: 'c1',
  saleDate: '2026-10-07',
  orderId: null,
  orderNumber: null,
  lines: [
    { sizeId: 'L', eggs: 102, pricePerTray: 420, lineTotal: 1428 },
    { sizeId: 'M', eggs: 90, pricePerTray: 380.5, lineTotal: 1141.5 },
  ],
  saleTotal: 2569.5,
  version: 1,
  voidedAt: null,
}
const names: Record<string, string> = { L: 'Large', M: 'Medium' }
const ctx = (over: Partial<InvoiceContext> = {}): InvoiceContext => ({
  farmName: 'Hilltop Egg Farm',
  clientName: 'Aling Nena',
  eggsPerTray: 30,
  sizeName: id => names[id] ?? 'Unknown size',
  formatPrice: n => formatPrice(n, 'PHP'),
  ...over,
})

describe('buildInvoiceView', () => {
  it('keeps lines in sale order with frozen figures', () => {
    const v = buildInvoiceView(sale, ctx())
    expect(v.lines.map(l => l.size)).toEqual(['Large', 'Medium'])
    expect(v.lines[0]).toEqual({ size: 'Large', quantity: '3 trays + 12 eggs (102 eggs)', price: '₱420.00', total: '₱1,428.00' })
    expect(v.lines[1]!.quantity).toBe('3 trays (90 eggs)')
    expect(v.total).toBe('₱2,569.50')
    expect(v.dateText).toBe('Oct 7, 2026')
    expect(v.typeText).toBe('Delivery')
    expect(v.billTo).toBe('Aling Nena')
    expect(v.walkIn).toBe(false)
  })

  it('AC10: a different tray size or currency changes only the split and the symbol, never the figures', () => {
    const v = buildInvoiceView(sale, ctx({ eggsPerTray: 12, formatPrice: n => formatPrice(n, 'USD') }))
    expect(v.lines[0]!.quantity).toBe('8 trays + 6 eggs (102 eggs)')
    expect(v.lines[0]!.total).toBe('$1,428.00')
    expect(v.total).toBe('$2,569.50')
  })

  it('prints the saved total, which equals the sum of the saved line totals to the cent', () => {
    const sum = Math.round(sale.lines.reduce((s, l) => s + l.lineTotal, 0) * 100)
    expect(Math.round(sale.saleTotal * 100)).toBe(sum)
  })

  it('AC8: an on-site sale with no client has no Bill to and no placeholder text', () => {
    const v = buildInvoiceView({ ...sale, type: 'on_site', clientId: null }, ctx({ clientName: null }))
    expect(v.billTo).toBeNull()
    expect(v.walkIn).toBe(true)
    expect(v.typeText).toBe('On-site')
    expect(Object.values(v.lines[0]!).join(' ')).not.toMatch(/null|undefined/)
  })

  it('shows an inactive client by plain name and an unknown size by its resolved name', () => {
    const v = buildInvoiceView({ ...sale, lines: [{ sizeId: 'gone', eggs: 30, pricePerTray: 1, lineTotal: 1 }] }, ctx())
    expect(v.billTo).toBe('Aling Nena')
    expect(v.lines[0]!.size).toBe('Unknown size')
  })

  it('AC12: a voided sale is flagged and its heading says VOID', () => {
    expect(buildInvoiceView({ ...sale, voidedAt: '2026-10-08' }, ctx()).voided).toBe(true)
    expect(invoiceHeading(1042, true)).toBe('Invoice #1042 - VOID')
    expect(invoiceHeading(1042, false)).toBe('Invoice #1042')
  })

  it('AC22: the title is exactly the number, never a name', () => {
    expect(invoiceTitle(1042)).toBe('Invoice 1042')
  })
})

describe('resolveInvoice', () => {
  const deps = (over: Partial<InvoiceDeps> = {}): InvoiceDeps => ({
    ensureFarm: async () => true,
    getSale: async () => ({ sale }),
    loadClients: async () => 'ok',
    clients: () => [{ id: 'c1', name: 'Aling Nena' }],
    ...over,
  })
  const fail = (statusCode: number) => async (): Promise<never> => {
    throw Object.assign(new Error('x'), { statusCode })
  }

  it('is ready with the client name joined from the list', async () => {
    expect(await resolveInvoice('id', deps())).toEqual({ status: 'ready', sale, clientName: 'Aling Nena' })
  })
  it('does not load clients for a sale with none', async () => {
    let called = false
    const s = { ...sale, clientId: null }
    const r = await resolveInvoice('id', deps({
      getSale: async () => ({ sale: s }),
      loadClients: async () => {
        called = true
        return 'ok'
      },
    }))
    expect(r).toEqual({ status: 'ready', sale: s, clientName: null })
    expect(called).toBe(false)
  })
  it('404 and 400 are both not found', async () => {
    expect(await resolveInvoice('id', deps({ getSale: fail(404) }))).toEqual({ status: 'not_found' })
    expect(await resolveInvoice('id', deps({ getSale: fail(400) }))).toEqual({ status: 'not_found' })
  })
  it('other failures are an error', async () => {
    expect(await resolveInvoice('id', deps({ getSale: fail(500) }))).toEqual({ status: 'error' })
    expect(await resolveInvoice('id', deps({ getSale: async () => ({}) as never }))).toEqual({ status: 'error' })
    expect(await resolveInvoice('id', deps({ getSale: async () => ({ sale: { ...sale, lines: [] } }) }))).toEqual({ status: 'error' })
    expect(await resolveInvoice('id', deps({ ensureFarm: async () => false }))).toEqual({ status: 'error' })
  })
  it('D13: a client that fails to load or is missing is an error, never walk-in', async () => {
    expect(await resolveInvoice('id', deps({ loadClients: async () => 'error' }))).toEqual({ status: 'error' })
    expect(await resolveInvoice('id', deps({ loadClients: async () => 'stale' }))).toEqual({ status: 'error' })
    expect(await resolveInvoice('id', deps({ clients: () => [] }))).toEqual({ status: 'error' })
  })
})
