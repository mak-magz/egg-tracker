import { describe, expect, it, vi } from 'vitest'
import { FetchError } from 'ofetch'
import {
  createOrderMutations,
  createOrderSubmissionTracker,
  deliverPayloadKey,
  ORDER_WRITE_TIMEOUT_MS,
  orderPayloadKey,
} from '../../app/utils/order-mutations'
import type { DeliverInput, OrderApi, OrderInput } from '../../app/utils/order-mutations'
import type { OrderDetail } from '../../shared/types/api'

const order = (id: string, orderNumber: number, version = 1, over: Partial<OrderDetail> = {}): OrderDetail => ({
  id,
  orderNumber,
  clientId: 'c1',
  orderDate: '2026-10-03',
  wantedBy: null,
  status: 'requested',
  closedShortAt: null,
  cancelledAt: null,
  convertedFromSaleNumber: null,
  lines: [{ sizeId: 'sz-large', orderedEggs: 900, deliveredEggs: 0, remainingEggs: 900, droppedEggs: 0, pricePerTray: 6.75, lineTotal: 202.5 }],
  orderTotal: 202.5,
  deliveryCount: 0,
  voidedDeliveryCount: 0,
  version,
  deliveries: [],
  ...over,
})

const input = (over: Partial<OrderInput> = {}): OrderInput => ({
  clientId: 'c1',
  orderDate: '2026-10-03',
  wantedBy: null,
  lines: [{ sizeId: 'sz-large', eggs: 900, pricePerTray: 6.75 }],
  ...over,
})

const delivery = (over: Partial<DeliverInput> = {}): DeliverInput => ({
  deliveredDate: '2026-10-04',
  lines: [{ sizeId: 'sz-large', eggs: 300 }],
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
  const calls: { url: string, opts: Parameters<OrderApi>[1], resolve: (v: unknown) => void, reject: (e: unknown) => void }[] = []
  const api = ((url: string, opts?: Parameters<OrderApi>[1]) => new Promise((resolve, reject) => {
    calls.push({ url, opts, resolve, reject })
  })) as OrderApi
  return { api, calls }
}

function build(api: OrderApi, ids: string[] = ['id-1', 'id-2', 'id-3', 'id-4']) {
  const upsert = vi.fn()
  const reload = vi.fn(async () => 'ok' as const)
  let n = 0
  const mutations = createOrderMutations({ api, upsert, reload, newId: () => ids[n++] ?? `id-extra-${n}` })
  return { mutations, upsert, reload }
}

describe('submission ids (AC16, AC31)', () => {
  it('create: the id is reused for a retry of the same payload (lines in any order) and replaced when anything changes', () => {
    let n = 0
    const t = createOrderSubmissionTracker(() => `id-${++n}`)
    const first = t.idFor(orderPayloadKey(input()))
    expect(t.idFor(orderPayloadKey(input()))).toBe(first)
    const reordered = input({ lines: [{ sizeId: 'sz-b', eggs: 30, pricePerTray: 5 }, { sizeId: 'sz-a', eggs: 60, pricePerTray: 6 }] })
    const swapped = input({ lines: [{ sizeId: 'sz-a', eggs: 60, pricePerTray: 6 }, { sizeId: 'sz-b', eggs: 30, pricePerTray: 5 }] })
    expect(orderPayloadKey(reordered)).toBe(orderPayloadKey(swapped))
    const changed = t.idFor(orderPayloadKey(input({ wantedBy: '2026-10-09' })))
    expect(changed).not.toBe(first)
  })

  it('a fresh id when the form or the step is opened again', () => {
    let n = 0
    const t = createOrderSubmissionTracker(() => `id-${++n}`)
    const first = t.idFor('a')
    t.reset()
    expect(t.idFor('a')).not.toBe(first)
  })

  it('deliver: the key names the order, the date and every line, so a retry is the same intent', () => {
    expect(deliverPayloadKey('o1', delivery())).toBe(deliverPayloadKey('o1', delivery()))
    expect(deliverPayloadKey('o1', delivery())).not.toBe(deliverPayloadKey('o2', delivery()))
    expect(deliverPayloadKey('o1', delivery())).not.toBe(deliverPayloadKey('o1', delivery({ deliveredDate: '2026-10-05' })))
    expect(deliverPayloadKey('o1', delivery())).not.toBe(deliverPayloadKey('o1', delivery({ lines: [{ sizeId: 'sz-large', eggs: 301 }] })))
  })
})

describe('createOrderMutations: create and update (one in-flight guard)', () => {
  it('create: POSTs the header + lines with a submission id, upserts the reply, never sends a tenant id or an order number', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const p = mutations.create(input())
    expect(mutations.saving.value).toBe(true)
    expect(calls[0]).toMatchObject({
      url: '/api/orders',
      opts: { method: 'POST', body: { submissionId: 'id-1', ...input() }, timeout: ORDER_WRITE_TIMEOUT_MS },
    })
    expect(JSON.stringify(calls[0]!.opts)).not.toMatch(/tenant|orderNumber|status/i)
    const reply = { order: order('o1', 12), replayed: false }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.order)
    expect(mutations.saving.value).toBe(false)
  })

  it('many taps send one request, and a retry of the same payload after a failure reuses the id (AC16)', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const first = mutations.create(input())
    expect(await mutations.create(input())).toBeNull()
    expect(await mutations.update(order('o1', 1), input())).toBeNull()
    expect(calls).toHaveLength(1)
    calls[0]!.reject(fetchError())
    expect(await first).toMatchObject({ ok: false, error: { kind: 'network' } })
    const retry = mutations.create(input())
    expect((calls[1]!.opts!.body as { submissionId: string }).submissionId).toBe('id-1')
    calls[1]!.resolve({ order: order('o1', 12), replayed: true })
    await retry
  })

  it('update: PUTs the whole order with the version the form opened with (AC20)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const p = mutations.update(order('a/b', 1, 4), input())
    expect(calls[0]).toMatchObject({ url: '/api/orders/a%2Fb', opts: { method: 'PUT', body: { version: 4, ...input() } } })
    const reply = { order: order('a/b', 1, 5), changed: true }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.order)
  })

  it('a stale edit (order_changed) upserts the returned order and does not reload (AC20)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, reload } = build(api)
    const current = order('o1', 12, 9)
    const p = mutations.update(order('o1', 12, 4), input())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'order_changed', order: current } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'order_changed', order: current } })
    expect(upsert).toHaveBeenCalledWith(current)
    expect(reload).not.toHaveBeenCalled()
  })

  it('order_changed with no order attached reloads on its own', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, reload } = build(api)
    const p = mutations.update(order('o1', 12), input())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'order_changed' } }))
    await p
    expect(upsert).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a validation error changes nothing in the list', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, reload } = build(api)
    const p = mutations.create(input())
    calls[0]!.reject(fetchError(400, { data: { code: 'validation_failed', fields: { clientId: 'Choose a client.' } } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'validation' } })
    expect(upsert).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('createOrderMutations: status, cancel, close short, deliver (guarded per order id)', () => {
  it('setStatus POSTs the status only', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const p = mutations.setStatus('o1', 'ready')
    expect(calls[0]).toMatchObject({ url: '/api/orders/o1/status', opts: { method: 'POST', body: { status: 'ready' } } })
    const reply = { order: order('o1', 12, 2, { status: 'ready' }), changed: true }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.order)
  })

  it('cancel POSTs with no body', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const p = mutations.cancel('o1')
    expect(calls[0]).toMatchObject({ url: '/api/orders/o1/cancel', opts: { method: 'POST' } })
    expect(calls[0]!.opts!.body).toBeUndefined()
    calls[0]!.resolve({ order: order('o1', 12, 2, { status: 'cancelled' }), changed: true })
    await p
  })

  it('cancel refused because of a delivery (has_delivery) upserts the order the server sent (AC22)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const current = order('o1', 12, 5, { status: 'partially_fulfilled', deliveryCount: 1 })
    const p = mutations.cancel('o1')
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'has_delivery', order: current } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'has_delivery' } })
    expect(upsert).toHaveBeenCalledWith(current)
  })

  it('closeShort sends the version the dialog was built from (AC34)', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const p = mutations.closeShort(order('o1', 12, 6))
    expect(calls[0]).toMatchObject({ url: '/api/orders/o1/close', opts: { method: 'POST', body: { version: 6 } } })
    calls[0]!.resolve({ order: order('o1', 12, 7, { status: 'fulfilled' }), changed: true })
    await p
  })

  it('deliver POSTs the date and the lines with a submission id and confirmShortfall (AC27, AC30)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const p = mutations.deliver('o1', delivery(), true)
    expect(calls[0]).toMatchObject({
      url: '/api/orders/o1/deliver',
      opts: { method: 'POST', body: { submissionId: 'id-2', deliveredDate: '2026-10-04', lines: [{ sizeId: 'sz-large', eggs: 300 }], confirmShortfall: true } },
    })
    const reply = { order: order('o1', 12, 2, { status: 'partially_fulfilled' }), sale: { saleNumber: 52 }, replayed: false }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.order)
  })

  it('"Deliver anyway" is the same request: the submission id is kept across the stock_short retry (AC31)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    mutations.resetDeliver()
    const first = mutations.deliver('o1', delivery(), false)
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'stock_short', shortfall: [{ sizeId: 'sz-large', onHandEggs: 90, neededEggs: 300 }] } }))
    expect(await first).toMatchObject({ ok: false, error: { kind: 'stock_short' } })
    expect(upsert).not.toHaveBeenCalled()
    const second = mutations.deliver('o1', delivery(), true)
    const a = (calls[0]!.opts!.body as { submissionId: string }).submissionId
    const b = (calls[1]!.opts!.body as { submissionId: string }).submissionId
    expect(b).toBe(a)
    calls[1]!.resolve({ order: order('o1', 12, 2), sale: { saleNumber: 52 }, replayed: false })
    await second
  })

  it('a different quantity is a different delivery: it gets a new submission id', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const first = mutations.deliver('o1', delivery())
    calls[0]!.reject(fetchError())
    await first
    const second = mutations.deliver('o1', delivery({ lines: [{ sizeId: 'sz-large', eggs: 150 }] }))
    expect((calls[1]!.opts!.body as { submissionId: string }).submissionId)
      .not.toBe((calls[0]!.opts!.body as { submissionId: string }).submissionId)
    calls[1]!.reject(fetchError())
    await second
  })

  it('over_delivery upserts the current order so the lines can refresh (AC26)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const current = order('o1', 12, 8, { status: 'partially_fulfilled' })
    const p = mutations.deliver('o1', delivery())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'over_delivery', order: current } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'over_delivery', order: current } })
    expect(upsert).toHaveBeenCalledWith(current)
  })

  it('a second tap on the same order resolves to null; another order runs at once (O-R1)', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const first = mutations.setStatus('o1', 'confirmed')
    expect(mutations.pendingIds.value).toEqual(['o1'])
    expect(await mutations.cancel('o1')).toBeNull()
    expect(await mutations.deliver('o1', delivery())).toBeNull()
    const other = mutations.setStatus('o2', 'ready')
    expect(calls).toHaveLength(2)
    expect(mutations.pendingIds.value).toEqual(['o1', 'o2'])
    calls[1]!.resolve({ order: order('o2', 13, 2), changed: true })
    await other
    expect(mutations.pendingIds.value).toEqual(['o1'])
    calls[0]!.resolve({ order: order('o1', 12, 2), changed: true })
    await first
    expect(mutations.pendingIds.value).toEqual([])
  })

  it('has no delete: orders are never deleted (AC23)', () => {
    const { api } = deferredApi()
    const { mutations } = build(api)
    expect(Object.keys(mutations).sort()).toEqual(['cancel', 'closeShort', 'create', 'deliver', 'pendingIds', 'resetCreate', 'resetDeliver', 'saving', 'setStatus', 'update'])
  })
})
