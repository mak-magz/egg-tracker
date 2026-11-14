import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TenantClient } from '../../server/utils/db'
import { ORDER_FIELDS, ORDER_MESSAGES } from '../../shared/constants/orders'

const { createTenantDbFromClient } = await import('../../server/utils/db')
const repo = await import('../../server/repositories/orders')

const TENANT = '11111111-1111-1111-1111-111111111111'
const ORDER_ID = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e71'
const SIZE_A = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e72'
const SIZE_B = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e73'
const CLIENT_A = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e74'
const SALE_ID = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e75'
const SUBMISSION = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'

interface Reply { data: unknown, error: unknown }

const orderRow = {
  id: ORDER_ID,
  orderNumber: 12,
  clientId: CLIENT_A,
  orderDate: '2026-10-03',
  wantedBy: null,
  status: 'requested',
  closedShortAt: null,
  cancelledAt: null,
  convertedFromSaleNumber: null,
  lines: [{ sizeId: SIZE_A, orderedEggs: 300, deliveredEggs: 0, remainingEggs: 300, droppedEggs: 0, pricePerTray: 6.5, lineTotal: 65 }],
  orderTotal: 65,
  deliveryCount: 0,
  voidedDeliveryCount: 0,
  version: 1,
  deliveries: [],
}
const saleRow = {
  id: SALE_ID,
  saleNumber: 7,
  type: 'delivery',
  clientId: CLIENT_A,
  saleDate: '2026-10-03',
  orderId: ORDER_ID,
  orderNumber: 12,
  version: 1,
  voidedAt: null,
  lines: [{ sizeId: SIZE_A, eggs: 120, pricePerTray: 6.5, lineTotal: 26 }],
  saleTotal: 26,
}

function fakeDb(responses: Record<string, Reply>, fallback: Reply = { data: { order: orderRow }, error: null }) {
  const calls: [string, Record<string, unknown>][] = []
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args])
      return Promise.resolve(fn in responses ? responses[fn] : fallback)
    },
  }
  return { db: createTenantDbFromClient(client as unknown as TenantClient, TENANT), calls }
}

const pgError = (code: string, extra: { hint?: string, details?: string } = {}) => ({ code, message: `error ${code}`, details: extra.details ?? '', hint: extra.hint ?? '' })
const consoleSpies = () => (['error', 'warn', 'log', 'info', 'debug'] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('orders repository: calls', () => {
  it('createOrder sends the lines as parallel arrays, injects p_tenant_id, omits an unset wantedBy', async () => {
    const { db, calls } = fakeDb({ create_order: { data: { order: orderRow, replayed: false }, error: null } })
    const res = await repo.createOrder(db, {
      submissionId: SUBMISSION,
      clientId: CLIENT_A,
      orderDate: '2026-10-03',
      lines: [{ sizeId: SIZE_A, eggs: 300, pricePerTray: 6.5 }, { sizeId: SIZE_B, eggs: 30, pricePerTray: 6 }],
      p_tenant_id: 'other',
    } as never)
    expect(res.replayed).toBe(false)
    expect(res.order.orderNumber).toBe(12)
    expect(calls[0]).toEqual(['create_order', {
      p_submission_id: SUBMISSION,
      p_client_id: CLIENT_A,
      p_order_date: '2026-10-03',
      p_size_ids: [SIZE_A, SIZE_B],
      p_eggs: [300, 30],
      p_prices: [6.5, 6],
      p_tenant_id: TENANT,
    }])
  })

  it('createOrder handles device-stamped string orderNumber', async () => {
    const { db } = fakeDb({ create_order: { data: { order: { ...orderRow, orderNumber: 'D1-0012' }, replayed: false }, error: null } })
    const res = await repo.createOrder(db, {
      submissionId: SUBMISSION,
      clientId: CLIENT_A,
      orderDate: '2026-10-03',
      lines: [{ sizeId: SIZE_A, eggs: 300, pricePerTray: 6.5 }],
    })
    expect(res.order.orderNumber).toBe('D1-0012')
  })

  it('updateOrder, setOrderStatus, cancelOrder and closeOrder send what the functions take', async () => {
    const change = { data: { order: orderRow, changed: true }, error: null }
    const { db, calls } = fakeDb({ update_order: change, set_order_status: change, cancel_order: change, close_order: change })
    await repo.updateOrder(db, ORDER_ID, { version: 3, clientId: CLIENT_A, orderDate: '2026-10-03', wantedBy: '2026-10-09', lines: [{ sizeId: SIZE_A, eggs: 30, pricePerTray: 6.5 }] })
    await repo.setOrderStatus(db, ORDER_ID, 'ready')
    await repo.cancelOrder(db, ORDER_ID)
    await repo.closeOrder(db, ORDER_ID, { version: 4 })
    expect(calls.map(c => c[0])).toEqual(['update_order', 'set_order_status', 'cancel_order', 'close_order'])
    expect(calls[0]![1]).toMatchObject({ p_order_id: ORDER_ID, p_version: 3, p_wanted_by: '2026-10-09', p_tenant_id: TENANT })
    expect(calls[1]![1]).toEqual({ p_order_id: ORDER_ID, p_status: 'ready', p_tenant_id: TENANT })
    expect(calls[2]![1]).toEqual({ p_order_id: ORDER_ID, p_tenant_id: TENANT })
    expect(calls[3]![1]).toEqual({ p_order_id: ORDER_ID, p_version: 4, p_tenant_id: TENANT })
  })

  it('deliverOrder sends the lines and confirmShortfall, and returns the order and the sale', async () => {
    const { db, calls } = fakeDb({ deliver_order: { data: { order: orderRow, sale: saleRow, replayed: true }, error: null } })
    const res = await repo.deliverOrder(db, ORDER_ID, { submissionId: SUBMISSION, deliveredDate: '2026-10-03', lines: [{ sizeId: SIZE_A, eggs: 120 }], confirmShortfall: true })
    expect(res.replayed).toBe(true)
    expect(res.sale).toMatchObject({ saleNumber: 7, orderId: ORDER_ID, orderNumber: 12 })
    expect(calls[0]![1]).toEqual({
      p_submission_id: SUBMISSION,
      p_order_id: ORDER_ID,
      p_delivered_date: '2026-10-03',
      p_size_ids: [SIZE_A],
      p_eggs: [120],
      p_confirm_shortfall: true,
      p_tenant_id: TENANT,
    })
  })

  it('getOrder returns the order or null; listOrders passes every filter and maps orders without deliveries', async () => {
    expect(await repo.getOrder(fakeDb({ get_order: { data: { order: null }, error: null } }).db, ORDER_ID)).toBeNull()
    const { db, calls } = fakeDb({ list_orders: { data: { hasAny: true, total: 1, orders: [orderRow] }, error: null } })
    const res = await repo.listOrders(db, { view: 'all', clientId: CLIENT_A, from: '2026-10-01', to: '2026-10-03', limit: 25, offset: 50 })
    expect(res.orders).toHaveLength(1)
    expect(res.orders[0]).not.toHaveProperty('deliveries')
    expect(calls[0]![1]).toEqual({ p_view: 'all', p_client_id: CLIENT_A, p_from: '2026-10-01', p_to: '2026-10-03', p_limit: 25, p_offset: 50, p_tenant_id: TENANT })
  })
})

describe('mapOrderDbError: every SQLSTATE of the 3.3.1 table', () => {
  const map = (error: ReturnType<typeof pgError>, op?: Parameters<typeof repo.mapOrderDbError>[2], id?: string, db = fakeDb({}).db) =>
    repo.mapOrderDbError(db, error, op, id)
  const withOrder = () => fakeDb({}, { data: { order: orderRow }, error: null }).db

  it('field errors', async () => {
    expect((await map(pgError('TM002', { hint: 'order_date' }))).data.fields).toEqual({ [ORDER_FIELDS.orderDate]: ORDER_MESSAGES.orderDateFuture })
    expect((await map(pgError('TM002', { hint: 'delivered_date' }))).data.fields).toEqual({ [ORDER_FIELDS.deliveredDate]: ORDER_MESSAGES.deliveredDateFuture })
    expect((await map(pgError('TM005'), 'create')).data.fields).toHaveProperty('submissionId')
    expect((await map(pgError('TM005'), 'close')).data.fields).toHaveProperty('version')
    expect((await map(pgError('TM005'), 'setStatus')).data.fields).toEqual({ status: ORDER_MESSAGES.statusInvalid })
    expect((await map(pgError('TM028'))).data.fields).toEqual({ lines: ORDER_MESSAGES.linesMax })
    expect((await map(pgError('TM029'))).data.fields).toEqual({ lines: ORDER_MESSAGES.linesDuplicateSize })
    expect((await map(pgError('TM031', { hint: 'too_large' }))).data.fields).toEqual({ lines: ORDER_MESSAGES.priceTooLargeServer })
    expect((await map(pgError('TM032', { hint: 'required' }))).data.fields).toEqual({ clientId: ORDER_MESSAGES.clientRequired })
    expect((await map(pgError('TM032', { hint: 'invalid' }))).data.fields).toEqual({ clientId: ORDER_MESSAGES.clientInvalid })
    expect((await map(pgError('TM033'))).data.fields).toEqual({ lines: ORDER_MESSAGES.linesSizesChanged })
    expect((await map(pgError('TM038'))).data.fields).toEqual({ submissionId: ORDER_MESSAGES.submissionReused })
    expect((await map(pgError('TM052', { hint: 'empty' }))).data.fields).toEqual({ lines: ORDER_MESSAGES.deliverNone })
  })

  it('TM055 picks the field from the hint', async () => {
    expect((await map(pgError('TM055', { hint: 'wanted_by' }))).data.fields).toEqual({ wantedBy: ORDER_MESSAGES.wantedByBeforeOrder })
    expect((await map(pgError('TM055', { hint: 'delivered_date' }))).data.fields).toEqual({ deliveredDate: ORDER_MESSAGES.deliveredDateBeforeOrder })
    expect((await map(pgError('TM055', { hint: 'order_date' }))).data.fields).toEqual({ orderDate: ORDER_MESSAGES.orderDateAfterFirstDelivery })
  })

  it('TM051 names each offending line, or the client', async () => {
    const details = JSON.stringify({ sizeIds: [SIZE_A, SIZE_B] })
    expect((await map(pgError('TM051', { hint: 'below_delivered', details }))).data.fields).toEqual({
      [`lines.${SIZE_A}`]: ORDER_MESSAGES.belowDelivered,
      [`lines.${SIZE_B}`]: ORDER_MESSAGES.belowDelivered,
    })
    expect((await map(pgError('TM051', { hint: 'line_locked', details }))).data.fields).toHaveProperty(`lines.${SIZE_A}`, ORDER_MESSAGES.lineLocked)
    expect((await map(pgError('TM051', { hint: 'line_locked', details: 'junk' }))).data.fields).toEqual({ lines: ORDER_MESSAGES.lineLocked })
    expect((await map(pgError('TM051', { hint: 'client_locked' }))).data.fields).toEqual({ clientId: ORDER_MESSAGES.clientLocked })
  })

  it('TM044 is a plain 404', async () => {
    const e = await map(pgError('TM044'))
    expect(e.statusCode).toBe(404)
    expect(e.data).toEqual({ code: 'not_found' })
  })

  it('the 409s carry the current order, re-read by id', async () => {
    const cases: [string, string, string | undefined][] = [
      ['TM045', 'order_changed', undefined],
      ['TM046', 'order_closed', undefined],
      ['TM047', 'has_delivery', undefined],
      ['TM049', 'has_delivery', undefined],
      ['TM048', 'not_partial', undefined],
      ['TM050', 'over_delivery', undefined],
      ['TM052', 'order_changed', 'not_on_order'],
    ]
    for (const [code, reason, hint] of cases) {
      const e = await map(pgError(code, { hint }), 'update', ORDER_ID, withOrder())
      expect(e.statusCode, code).toBe(409)
      expect(e.data.code).toBe('conflict')
      expect(e.data.reason, code).toBe(reason)
      expect(e.data.order, code).toMatchObject({ id: ORDER_ID, orderNumber: 12 })
    }
  })

  it('a 409 carries no order when the re-read fails or no id is known', async () => {
    const failing = fakeDb({}, { data: null, error: pgError('XX000') }).db
    expect((await map(pgError('TM045'), 'update', ORDER_ID, failing)).data).toEqual({ code: 'conflict', reason: 'order_changed' })
    expect((await map(pgError('TM045'), 'update')).data).toEqual({ code: 'conflict', reason: 'order_changed' })
  })

  it('TM037 is a 409 stock_short with the shortfall parsed from DETAIL', async () => {
    const details = JSON.stringify({ shortfall: [{ sizeId: SIZE_A, onHandEggs: 30, neededEggs: 60 }] })
    const e = await map(pgError('TM037', { details }))
    expect(e.data).toEqual({ code: 'conflict', reason: 'stock_short', shortfall: [{ sizeId: SIZE_A, onHandEggs: 30, neededEggs: 60 }] })
    expect((await map(pgError('TM037', { details: 'nope' }))).data).toEqual({ code: 'conflict', reason: 'stock_short' })
  })

  it('TM006, TM053, TM054, the 23505/23514 backstops and anything else are a bare 500 that logs only the code', async () => {
    const spies = consoleSpies()
    const codes = ['TM006', 'TM053', 'TM054', '23505', '23514', 'XX000']
    for (const code of codes) {
      const e = await map(pgError(code))
      expect(e.statusCode, code).toBe(500)
      expect(e.data).toEqual({ code: 'internal' })
    }
    expect(spies[0]!.mock.calls.map(c => c[0])).toEqual(codes.map(c => `[orders] database error ${c}`))
  })
})

describe('no personal data or raw error content in a log (AC54)', () => {
  const SENTINEL = 'SENTINEL-Oakhill-Bakery-555-0123'

  it('a failed rpc call never logs the message, details or hint', async () => {
    const spies = consoleSpies()
    const bad = { code: 'XX000', message: SENTINEL, details: SENTINEL, hint: SENTINEL }
    const input = { submissionId: SUBMISSION, clientId: CLIENT_A, orderDate: '2026-10-03', lines: [{ sizeId: SIZE_A, eggs: 30, pricePerTray: 6.5 }] }
    await expect(repo.createOrder(fakeDb({ create_order: { data: null, error: bad } }).db, input)).rejects.toBeTruthy()
    expect(JSON.stringify(spies.flatMap(s => s.mock.calls))).not.toContain(SENTINEL)
  })

  it('an unexpected function result is a bare 500 that logs no data', async () => {
    const spies = consoleSpies()
    await expect(repo.getOrder(fakeDb({ get_order: { data: { order: { id: SENTINEL } }, error: null } }).db, ORDER_ID)).rejects.toMatchObject({ statusCode: 500 })
    const logs = JSON.stringify(spies.flatMap(s => s.mock.calls))
    expect(logs).toContain('[orders] unexpected get_order result')
    expect(logs).not.toContain(SENTINEL)
  })
})
