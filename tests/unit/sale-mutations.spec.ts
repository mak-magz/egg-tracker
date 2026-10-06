import { describe, expect, it, vi } from 'vitest'
import { FetchError } from 'ofetch'
import {
  createSaleMutations,
  createSaleSubmissionTracker,
  SALE_WRITE_TIMEOUT_MS,
} from '../../app/utils/sale-mutations'
import type { SaleApi, SaleInput } from '../../app/utils/sale-mutations'
import type { OrderDetail, Sale } from '../../shared/types/api'

const sale = (id: string, saleNumber: number, version = 1, over: Partial<Sale> = {}): Sale => ({
  id,
  saleNumber,
  type: 'delivery',
  clientId: 'c1',
  saleDate: '2026-09-27',
  orderId: null,
  orderNumber: null,
  lines: [{ sizeId: 'sz-large', eggs: 240, pricePerTray: 6.5, lineTotal: 52 }],
  saleTotal: 52,
  version,
  voidedAt: null,
  ...over,
})

const order = (over: Partial<OrderDetail> = {}): OrderDetail => ({
  id: 'o1',
  orderNumber: 12,
  clientId: 'c1',
  orderDate: '2026-09-20',
  wantedBy: null,
  status: 'ready',
  closedShortAt: null,
  cancelledAt: null,
  convertedFromSaleNumber: null,
  lines: [{ sizeId: 'sz-large', orderedEggs: 300, deliveredEggs: 0, remainingEggs: 300, droppedEggs: 0, pricePerTray: 6.5, lineTotal: 65 }],
  orderTotal: 65,
  deliveryCount: 0,
  voidedDeliveryCount: 1,
  version: 4,
  deliveries: [],
  ...over,
})

const input = (over: Partial<SaleInput> = {}): SaleInput => ({
  type: 'delivery',
  saleDate: '2026-09-27',
  clientId: 'c1',
  lines: [{ sizeId: 'sz-large', eggs: 240, pricePerTray: 6.5 }],
  ...over,
})

function fetchError(statusCode?: number, data?: unknown): FetchError {
  const e = new FetchError('failed')
  if (statusCode !== undefined) {
    e.statusCode = statusCode
    e.status = statusCode
  }
  e.data = data
  return e
}

function deferredApi() {
  const calls: { url: string, opts: Parameters<SaleApi>[1], resolve: (v: unknown) => void, reject: (e: unknown) => void }[] = []
  const api = ((url: string, opts?: Parameters<SaleApi>[1]) => new Promise((resolve, reject) => {
    calls.push({ url, opts, resolve, reject })
  })) as SaleApi
  return { api, calls }
}

function build(api: SaleApi, ids: string[] = ['id-1', 'id-2', 'id-3', 'id-4']) {
  const upsert = vi.fn()
  const patchOrder = vi.fn()
  const refreshOrders = vi.fn()
  const reload = vi.fn(async () => 'ok' as const)
  let n = 0
  const mutations = createSaleMutations({ api, upsert, patchOrder, refreshOrders, reload, newId: () => ids[n++] ?? `id-extra-${n}` })
  return { mutations, upsert, patchOrder, refreshOrders, reload }
}

describe('createSaleSubmissionTracker (AC30)', () => {
  it('reuses the id for a retry of the same normalised payload (lines sorted by size), and replaces it when anything changes', () => {
    let n = 0
    const t = createSaleSubmissionTracker(() => `id-${++n}`)
    const first = t.idFor(input())
    // same lines, different order -> same id
    expect(t.idFor(input({ lines: [{ sizeId: 'sz-large', eggs: 240, pricePerTray: 6.5 }] }))).toBe(first)
    const changed = t.idFor(input({ saleDate: '2026-09-20' }))
    expect(changed).not.toBe(first)
    expect(t.idFor(input({ saleDate: '2026-09-20' }))).toBe(changed)
  })

  it('EXCLUDES confirmShortfall from the payload key: retrying with "record anyway" is not a different payload', () => {
    let n = 0
    const t = createSaleSubmissionTracker(() => `id-${++n}`)
    // confirmShortfall isn't part of SaleInput at all, so the same input always yields the same id regardless.
    const first = t.idFor(input())
    expect(t.idFor(input())).toBe(first)
  })

  it('gets a fresh id when the form is opened again', () => {
    let n = 0
    const t = createSaleSubmissionTracker(() => `id-${++n}`)
    const first = t.idFor(input())
    t.reset()
    expect(t.idFor(input())).not.toBe(first)
  })
})

describe('createSaleMutations: create and update (one in-flight guard)', () => {
  it('create: POSTs the header + lines with a submission id and confirmShortfall, upserts the reply', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const p = mutations.create(input())
    expect(mutations.saving.value).toBe(true)
    expect(calls[0]).toMatchObject({
      url: '/api/sales',
      opts: { method: 'POST', body: { submissionId: 'id-1', ...input(), confirmShortfall: false }, timeout: SALE_WRITE_TIMEOUT_MS },
    })
    const reply = { sale: sale('s1', 1042), replayed: false }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.sale)
    expect(mutations.saving.value).toBe(false)
  })

  it('create never sends a delivered date or a status (feature 05 AC37, AC38)', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    void mutations.create(input())
    const body = calls[0]!.opts!.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['clientId', 'confirmShortfall', 'lines', 'saleDate', 'submissionId', 'type'])
    calls[0]!.resolve({ sale: sale('s1', 1), replayed: false })
  })

  it('create with confirmShortfall = true sends it through', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    void mutations.create(input(), true)
    expect((calls[0]!.opts!.body as { confirmShortfall: boolean }).confirmShortfall).toBe(true)
    calls[0]!.resolve({ sale: sale('s1', 1), replayed: false })
  })

  it('many taps send one request: a call made while one runs resolves to null (AC30)', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const first = mutations.create(input())
    expect(await mutations.create(input())).toBeNull()
    expect(await mutations.update(sale('s1', 1), input())).toBeNull()
    expect(calls).toHaveLength(1)
    calls[0]!.resolve({ sale: sale('s1', 1), replayed: false })
    await first
    const next = mutations.create(input({ saleDate: '2026-09-20' }))
    expect(calls).toHaveLength(2)
    calls[1]!.resolve({ sale: sale('s2', 2), replayed: false })
    await next
  })

  it('update: PUTs the version the form opened with', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const p = mutations.update(sale('a/b', 1, 4), input())
    expect(calls[0]).toMatchObject({
      url: '/api/sales/a%2Fb',
      opts: { method: 'PUT', body: { version: 4, ...input(), confirmShortfall: false } },
    })
    const reply = { sale: sale('a/b', 1, 5), changed: true }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.sale)
  })

  it('never sends a tenant id', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const p = mutations.create(input())
    calls[0]!.reject(fetchError())
    await p
    expect(JSON.stringify(calls.map(c => c.opts))).not.toMatch(/tenant/i)
  })

  it('a stale edit (sale_changed) upserts the returned sale and reloads (AC43)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, reload } = build(api)
    const current = sale('s1', 1042, 9, { saleDate: '2026-09-28' })
    const p = mutations.update(sale('s1', 1042, 4), input())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'sale_changed', sale: current } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'sale_changed', sale: current } })
    expect(upsert).toHaveBeenCalledWith(current)
    expect(reload).not.toHaveBeenCalled() // the reply already carried the current sale
  })

  it('sale_changed with no sale attached reloads on its own', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, reload } = build(api)
    const p = mutations.update(sale('s1', 1), input())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'sale_changed' } }))
    await p
    expect(upsert).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('stock_short does NOT trigger a reload or upsert: the form shows the shortfall dialog itself', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, reload } = build(api)
    const shortfall = [{ sizeId: 'sz-large', onHandEggs: 90, neededEggs: 240 }]
    const p = mutations.create(input())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'stock_short', shortfall } }))
    expect(await p).toEqual({ ok: false, error: { kind: 'stock_short', shortfall } })
    expect(upsert).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('editing the date of a delivery made from an order quietly refreshes the Orders list (its version moved, AC36)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, refreshOrders } = build(api)
    const linked = sale('s1', 52, 2, { orderId: 'o1', orderNumber: 12 })
    const p = mutations.update(sale('s1', 52, 1, { orderId: 'o1', orderNumber: 12 }), input())
    calls[0]!.resolve({ sale: linked, changed: true })
    await p
    expect(refreshOrders).toHaveBeenCalledTimes(1)
  })

  it('a direct sale edit does not touch the Orders list', async () => {
    const { api, calls } = deferredApi()
    const { mutations, refreshOrders } = build(api)
    const p = mutations.update(sale('s1', 1, 1), input())
    calls[0]!.resolve({ sale: sale('s1', 1, 2), changed: true })
    await p
    expect(refreshOrders).not.toHaveBeenCalled()
  })

  it('a refused edit of a linked delivery (sale_locked) upserts the current sale', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const current = sale('s1', 52, 3, { orderId: 'o1', orderNumber: 12 })
    const p = mutations.update(sale('s1', 52, 3), input())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'sale_locked', sale: current } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'sale_locked', sale: current } })
    expect(upsert).toHaveBeenCalledWith(current)
  })
})

describe('createSaleMutations: voidSale (guarded per sale id; sales are void-only, feature 05 AC40)', () => {
  it('has no mark-delivered, mark-pending or delete', () => {
    const { api } = deferredApi()
    const { mutations } = build(api)
    expect(Object.keys(mutations).sort()).toEqual(['create', 'pendingIds', 'resetCreate', 'saving', 'update', 'voidSale'])
  })

  it('voidSale POSTs the version and upserts the sale', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, patchOrder } = build(api)
    const p = mutations.voidSale(sale('s1', 1, 3))
    expect(calls[0]).toMatchObject({ url: '/api/sales/s1/void', opts: { method: 'POST', body: { version: 3 } } })
    const reply = { sale: sale('s1', 1, 4, { voidedAt: '2026-09-27' }), changed: true, order: null }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.sale)
    expect(patchOrder).not.toHaveBeenCalled() // a direct sale has no order
  })

  it('voiding a delivery patches the order the server recomputed into the Orders list (AC35)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, patchOrder } = build(api)
    const p = mutations.voidSale(sale('s52', 52, 1, { orderId: 'o1', orderNumber: 12 }))
    const reopened = order({ status: 'ready' })
    calls[0]!.resolve({ sale: sale('s52', 52, 2, { orderId: 'o1', orderNumber: 12, voidedAt: '2026-09-27' }), changed: true, order: reopened })
    await p
    expect(patchOrder).toHaveBeenCalledWith(reopened)
  })

  it('a second tap on the same sale resolves to null; another sale runs at once (UX R1)', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const first = mutations.voidSale(sale('s1', 1))
    expect(mutations.pendingIds.value).toEqual(['s1'])
    expect(await mutations.voidSale(sale('s1', 1))).toBeNull()
    const other = mutations.voidSale(sale('s2', 2))
    expect(calls).toHaveLength(2)
    expect(mutations.pendingIds.value).toEqual(['s1', 's2'])
    calls[1]!.resolve({ sale: sale('s2', 2, 2, { voidedAt: '2026-09-27' }), changed: true, order: null })
    await other
    expect(mutations.pendingIds.value).toEqual(['s1'])
    calls[0]!.resolve({ sale: sale('s1', 1, 2, { voidedAt: '2026-09-27' }), changed: true, order: null })
    await first
    expect(mutations.pendingIds.value).toEqual([])
  })

  it('a voided / sale_changed error upserts the attached current sale', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const current = sale('s1', 1, 6, { voidedAt: '2026-09-26' })
    const p = mutations.voidSale(sale('s1', 1, 5))
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'voided', sale: current } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'voided', sale: current } })
    expect(upsert).toHaveBeenCalledWith(current)
  })
})
