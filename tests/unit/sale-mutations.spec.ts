import { describe, expect, it, vi } from 'vitest'
import { FetchError } from 'ofetch'
import {
  createSaleMutations,
  createSaleSubmissionTracker,
  SALE_WRITE_TIMEOUT_MS,
} from '../../app/utils/sale-mutations'
import type { SaleApi, SaleInput } from '../../app/utils/sale-mutations'
import type { Sale } from '../../shared/types/api'

const sale = (id: string, saleNumber: number, version = 1, over: Partial<Sale> = {}): Sale => ({
  id,
  saleNumber,
  type: 'delivery',
  status: 'pending',
  clientId: 'c1',
  saleDate: '2026-09-27',
  deliveredDate: null,
  lines: [{ sizeId: 'sz-large', eggs: 240, pricePerTray: 6.5, lineTotal: 52 }],
  saleTotal: 52,
  version,
  voidedAt: null,
  ...over,
})

const input = (over: Partial<SaleInput> = {}): SaleInput => ({
  type: 'delivery',
  saleDate: '2026-09-27',
  clientId: 'c1',
  deliveredDate: null,
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
  const removeFromList = vi.fn()
  const reload = vi.fn(async () => 'ok' as const)
  let n = 0
  const mutations = createSaleMutations({ api, upsert, removeFromList, reload, newId: () => ids[n++] ?? `id-extra-${n}` })
  return { mutations, upsert, removeFromList, reload }
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
    const current = sale('s1', 1042, 9, { status: 'complete', deliveredDate: '2026-09-28' })
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
})

describe('createSaleMutations: markDelivered / markPending / voidSale / remove (guarded per sale id)', () => {
  it('markDelivered POSTs the delivered date and confirmShortfall', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const p = mutations.markDelivered('s1', '2026-09-27', true)
    expect(calls[0]).toMatchObject({
      url: '/api/sales/s1/mark-delivered',
      opts: { method: 'POST', body: { deliveredDate: '2026-09-27', confirmShortfall: true } },
    })
    const reply = { sale: sale('s1', 1, 2, { status: 'complete', deliveredDate: '2026-09-27' }), changed: true }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.sale)
  })

  it('markPending POSTs with no body', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const p = mutations.markPending('s1')
    expect(calls[0]).toMatchObject({ url: '/api/sales/s1/mark-pending', opts: { method: 'POST' } })
    expect(calls[0]!.opts!.body).toBeUndefined()
    calls[0]!.resolve({ sale: sale('s1', 1), changed: true })
    await p
  })

  it('voidSale POSTs the version', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const p = mutations.voidSale(sale('s1', 1, 3))
    expect(calls[0]).toMatchObject({ url: '/api/sales/s1/void', opts: { method: 'POST', body: { version: 3 } } })
    calls[0]!.resolve({ sale: sale('s1', 1, 4, { voidedAt: '2026-09-27' }), changed: true })
    await p
  })

  it('remove DELETEs and removes the sale from the list, not upserts it', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, removeFromList } = build(api)
    const p = mutations.remove('s1')
    expect(calls[0]).toMatchObject({ url: '/api/sales/s1', opts: { method: 'DELETE' } })
    calls[0]!.resolve({ saleId: 's1', saleNumber: 1042 })
    expect(await p).toEqual({ ok: true, data: { saleId: 's1', saleNumber: 1042 } })
    expect(removeFromList).toHaveBeenCalledWith('s1')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('remove treats a 404 (already gone elsewhere) as no special reload, just an error the caller decides how to treat', async () => {
    const { api, calls } = deferredApi()
    const { mutations, reload } = build(api)
    const p = mutations.remove('s1')
    calls[0]!.reject(fetchError(404, { data: { code: 'not_found' } }))
    expect(await p).toEqual({ ok: false, error: { kind: 'not_found' } })
    expect(reload).not.toHaveBeenCalled()
  })

  it('a second tap on the same sale resolves to null; another sale runs at once (UX R1)', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const first = mutations.markDelivered('s1', '2026-09-27')
    expect(mutations.pendingIds.value).toEqual(['s1'])
    expect(await mutations.markDelivered('s1', '2026-09-27')).toBeNull()
    expect(await mutations.remove('s1')).toBeNull()
    const other = mutations.markPending('s2')
    expect(calls).toHaveLength(2)
    expect(mutations.pendingIds.value).toEqual(['s1', 's2'])
    calls[1]!.resolve({ sale: sale('s2', 2), changed: true })
    await other
    expect(mutations.pendingIds.value).toEqual(['s1'])
    calls[0]!.resolve({ sale: sale('s1', 1, 2, { status: 'complete' }), changed: true })
    await first
    expect(mutations.pendingIds.value).toEqual([])
  })

  it('not_pending / not_complete / voided errors upsert the attached current sale', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const current = sale('s1', 1, 6, { status: 'complete' })
    const p = mutations.remove('s1')
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'not_pending', sale: current } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'not_pending', sale: current } })
    expect(upsert).toHaveBeenCalledWith(current)
  })
})
