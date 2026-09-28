import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/types/database.types'
import { SALE_FIELDS, SALE_MESSAGES } from '../../shared/constants/sales'

vi.mock('#supabase/server', () => ({ serverSupabaseClient: vi.fn() }))

const { createTenantDbFromClient } = await import('../../server/utils/db')
const repo = await import('../../server/repositories/sales')

const TENANT = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const SALE_ID = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e61'
const SIZE_A = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e62'
const SIZE_B = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e63'
const CLIENT_A = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e64'
const SUBMISSION = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'

interface Reply { data: unknown, error: unknown }

const saleRow = {
  id: SALE_ID,
  saleNumber: 1042,
  type: 'delivery',
  status: 'pending',
  clientId: CLIENT_A,
  saleDate: '2026-09-27',
  deliveredDate: null,
  version: 1,
  voidedAt: null,
  lines: [{ sizeId: SIZE_A, eggs: 241, pricePerTray: 6.75, lineTotal: 54.23 }],
  saleTotal: 54.23,
}

const sale = {
  id: SALE_ID,
  saleNumber: 1042,
  type: 'delivery' as const,
  status: 'pending' as const,
  clientId: CLIENT_A,
  saleDate: '2026-09-27',
  deliveredDate: null,
  version: 1,
  voidedAt: null,
  lines: [{ sizeId: SIZE_A, eggs: 241, pricePerTray: 6.75, lineTotal: 54.23 }],
  saleTotal: 54.23,
}

/** A fake supabase client that only ever calls .rpc() (this repository never touches .from()). Replies come from
 * `responses[fn]`, or `fallback` for a function not listed (e.g. get_sale, used internally by mapSaleDbError). */
function fakeDb(responses: Record<string, Reply>, fallback: Reply = { data: { sale: saleRow }, error: null }) {
  const calls: [string, Record<string, unknown>][] = []
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args])
      return Promise.resolve(fn in responses ? responses[fn] : fallback)
    },
  }
  return { db: createTenantDbFromClient(client as unknown as SupabaseClient<Database>, TENANT), calls }
}

function pgError(code: string, extra: { hint?: string, details?: string } = {}) {
  return { code, message: `error ${code}`, details: extra.details ?? '', hint: extra.hint ?? '' }
}

interface Thrown { statusCode: number, data: { code: string, fields?: Record<string, string>, reason?: string, sale?: unknown, shortfall?: unknown } }

async function thrown(p: Promise<unknown>): Promise<Thrown> {
  try {
    await p
  }
  catch (e) {
    return e as Thrown
  }
  throw new Error('expected a rejection')
}

const consoleSpies = () => (['error', 'warn', 'log', 'info', 'debug'] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}))
const logged = (spies: ReturnType<typeof consoleSpies>) => JSON.stringify(spies.flatMap(s => s.mock.calls))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('toSale', () => {
  it('maps a jsonb row to the API Sale shape (already camelCase, no transformation needed)', () => {
    expect(repo.toSale(saleRow)).toEqual(sale)
  })
})

describe('sales repository: create / update', () => {
  it('createSale sends the lines as parallel arrays, injects p_tenant_id, omits unset optional fields', async () => {
    const { db, calls } = fakeDb({ create_sale: { data: { sale: saleRow, replayed: false }, error: null } })
    const input = {
      submissionId: SUBMISSION,
      type: 'delivery' as const,
      saleDate: '2026-09-27',
      lines: [{ sizeId: SIZE_A, eggs: 241, pricePerTray: 6.75 }, { sizeId: SIZE_B, eggs: 120, pricePerTray: 6 }],
      tenant_id: OTHER,
      p_tenant_id: OTHER,
    } as never
    expect(await repo.createSale(db, input)).toEqual({ sale, replayed: false })
    expect(calls).toEqual([['create_sale', {
      p_submission_id: SUBMISSION,
      p_type: 'delivery',
      p_sale_date: '2026-09-27',
      p_size_ids: [SIZE_A, SIZE_B],
      p_eggs: [241, 120],
      p_prices: [6.75, 6],
      p_tenant_id: TENANT,
    }]])
    expect(calls[0]![1]).not.toHaveProperty('p_client_id')
    expect(calls[0]![1]).not.toHaveProperty('p_delivered_date')
    expect(calls[0]![1]).not.toHaveProperty('p_confirm_shortfall')
  })

  it('createSale sends clientId, deliveredDate and confirmShortfall when set', async () => {
    const { db, calls } = fakeDb({ create_sale: { data: { sale: saleRow, replayed: false }, error: null } })
    await repo.createSale(db, {
      submissionId: SUBMISSION,
      type: 'delivery',
      saleDate: '2026-09-27',
      clientId: CLIENT_A,
      deliveredDate: '2026-09-27',
      lines: [{ sizeId: SIZE_A, eggs: 30, pricePerTray: 6.5 }],
      confirmShortfall: true,
    })
    expect(calls[0]![1]).toMatchObject({ p_client_id: CLIENT_A, p_delivered_date: '2026-09-27', p_confirm_shortfall: true })
  })

  it('a replayed create returns the first sale with replayed: true', async () => {
    const { db } = fakeDb({ create_sale: { data: { sale: saleRow, replayed: true }, error: null } })
    const res = await repo.createSale(db, { submissionId: SUBMISSION, type: 'on_site', saleDate: '2026-09-27', lines: [{ sizeId: SIZE_A, eggs: 30, pricePerTray: 6.5 }] })
    expect(res.replayed).toBe(true)
  })

  it('updateSale sends the version and every field, and reports changed', async () => {
    const { db, calls } = fakeDb({ update_sale: { data: { sale: saleRow, changed: true }, error: null } })
    const res = await repo.updateSale(db, SALE_ID, {
      version: 3,
      type: 'on_site',
      saleDate: '2026-09-27',
      clientId: null,
      lines: [{ sizeId: SIZE_A, eggs: 30, pricePerTray: 6.5 }],
    })
    expect(res).toEqual({ sale, changed: true })
    expect(calls[0]).toEqual(['update_sale', {
      p_sale_id: SALE_ID,
      p_version: 3,
      p_type: 'on_site',
      p_sale_date: '2026-09-27',
      p_size_ids: [SIZE_A],
      p_eggs: [30],
      p_prices: [6.5],
      p_tenant_id: TENANT,
    }])
  })

  it('updateSale reports changed: false with no error', async () => {
    const { db } = fakeDb({ update_sale: { data: { sale: saleRow, changed: false }, error: null } })
    const res = await repo.updateSale(db, SALE_ID, { version: 1, type: 'on_site', saleDate: '2026-09-27', lines: [{ sizeId: SIZE_A, eggs: 30, pricePerTray: 6.5 }] })
    expect(res.changed).toBe(false)
  })
})

describe('sales repository: status changes and delete/void', () => {
  it('markSaleDelivered sends the id, date and optional confirmShortfall', async () => {
    const { db, calls } = fakeDb({ mark_sale_delivered: { data: { sale: saleRow, changed: true }, error: null } })
    await repo.markSaleDelivered(db, SALE_ID, { deliveredDate: '2026-09-27', confirmShortfall: true })
    expect(calls[0]).toEqual(['mark_sale_delivered', { p_sale_id: SALE_ID, p_delivered_date: '2026-09-27', p_confirm_shortfall: true, p_tenant_id: TENANT }])
  })

  it('markSalePending sends just the id', async () => {
    const { db, calls } = fakeDb({ mark_sale_pending: { data: { sale: saleRow, changed: true }, error: null } })
    await repo.markSalePending(db, SALE_ID)
    expect(calls[0]).toEqual(['mark_sale_pending', { p_sale_id: SALE_ID, p_tenant_id: TENANT }])
  })

  it('deleteSale returns saleId and saleNumber', async () => {
    const { db, calls } = fakeDb({ delete_sale: { data: { saleId: SALE_ID, saleNumber: 1042 }, error: null } })
    expect(await repo.deleteSale(db, SALE_ID)).toEqual({ saleId: SALE_ID, saleNumber: 1042 })
    expect(calls[0]).toEqual(['delete_sale', { p_sale_id: SALE_ID, p_tenant_id: TENANT }])
  })

  it('voidSale sends the id and version, and reports changed', async () => {
    const { db, calls } = fakeDb({ void_sale: { data: { sale: { ...saleRow, voidedAt: '2026-09-27' }, changed: true }, error: null } })
    const res = await repo.voidSale(db, SALE_ID, { version: 2 })
    expect(res.changed).toBe(true)
    expect(res.sale.voidedAt).toBe('2026-09-27')
    expect(calls[0]).toEqual(['void_sale', { p_sale_id: SALE_ID, p_version: 2, p_tenant_id: TENANT }])
  })
})

describe('sales repository: reads', () => {
  it('getSale returns the sale, or null when the function returns { sale: null }', async () => {
    const hit = fakeDb({ get_sale: { data: { sale: saleRow }, error: null } })
    expect(await repo.getSale(hit.db, SALE_ID)).toEqual(sale)
    const miss = fakeDb({ get_sale: { data: { sale: null }, error: null } })
    expect(await repo.getSale(miss.db, SALE_ID)).toBeNull()
  })

  it('listSales passes every filter and maps every sale', async () => {
    const { db, calls } = fakeDb({ list_sales: { data: { hasAny: true, total: 1, sales: [saleRow] }, error: null } })
    const res = await repo.listSales(db, { from: '2026-09-01', to: '2026-09-27', status: 'pending', type: 'delivery', clientId: CLIENT_A, limit: 25, offset: 0, includeVoided: true })
    expect(res).toEqual({ hasAny: true, total: 1, sales: [sale] })
    expect(calls[0]).toEqual(['list_sales', {
      p_from: '2026-09-01', p_to: '2026-09-27', p_status: 'pending', p_type: 'delivery', p_client_id: CLIENT_A,
      p_limit: 25, p_offset: 0, p_include_voided: true, p_tenant_id: TENANT,
    }])
  })

  it('getOnHand omits p_size_ids when none are given, and sends them when given', async () => {
    const a = fakeDb({ get_on_hand: { data: { onHand: [{ sizeId: SIZE_A, eggs: 90 }] }, error: null } })
    expect(await repo.getOnHand(a.db)).toEqual({ onHand: [{ sizeId: SIZE_A, eggs: 90 }] })
    expect(a.calls[0]![1]).not.toHaveProperty('p_size_ids')
    const b = fakeDb({ get_on_hand: { data: { onHand: [] }, error: null } })
    await repo.getOnHand(b.db, [SIZE_A, SIZE_B])
    expect(b.calls[0]![1]).toMatchObject({ p_size_ids: [SIZE_A, SIZE_B] })
  })
})

describe('mapSaleDbError: every SQLSTATE of the §3.3 table', () => {
  const map = (error: ReturnType<typeof pgError>, op?: Parameters<typeof repo.mapSaleDbError>[2], id?: string) =>
    repo.mapSaleDbError(fakeDb({}).db, error, op, id)

  it('TM002 picks the field from the hint', async () => {
    const a = await map(pgError('TM002', { hint: 'sale_date' }))
    expect(a.statusCode).toBe(400)
    expect(a.data).toEqual({ code: 'validation_failed', fields: { [SALE_FIELDS.saleDate]: SALE_MESSAGES.saleDateFuture } })
    const b = await map(pgError('TM002', { hint: 'delivered_date' }))
    expect(b.data).toEqual({ code: 'validation_failed', fields: { [SALE_FIELDS.deliveredDate]: SALE_MESSAGES.deliveredDateFuture } })
  })

  it('TM005 lands on the field of the operation', async () => {
    expect((await map(pgError('TM005'), 'create')).data.fields).toEqual({ submissionId: SALE_MESSAGES.saleChanged })
    expect((await map(pgError('TM005'), 'update')).data.fields).toEqual({ version: SALE_MESSAGES.saleChanged })
    expect((await map(pgError('TM005'), 'delete')).data.fields).toEqual({ id: SALE_MESSAGES.saleChanged })
  })

  it('TM027 (unknown or another farm\'s sale) is a plain 404', async () => {
    const e = await map(pgError('TM027'))
    expect(e.statusCode).toBe(404)
    expect(e.data).toEqual({ code: 'not_found' })
  })

  it('TM028, TM029, TM030, TM033 land on fields.lines', async () => {
    expect((await map(pgError('TM028'))).data.fields).toEqual({ lines: SALE_MESSAGES.linesMax })
    expect((await map(pgError('TM029'))).data.fields).toEqual({ lines: SALE_MESSAGES.linesDuplicateSize })
    expect((await map(pgError('TM030'))).data.fields).toEqual({ lines: SALE_MESSAGES.linesInvalid })
    expect((await map(pgError('TM033'))).data.fields).toEqual({ lines: SALE_MESSAGES.linesSizesChanged })
  })

  it('TM031 picks the price message from the hint', async () => {
    expect((await map(pgError('TM031', { hint: 'too_many_decimals' }))).data.fields).toEqual({ lines: SALE_MESSAGES.priceTooManyDecimals })
    expect((await map(pgError('TM031', { hint: 'not_positive' }))).data.fields).toEqual({ lines: SALE_MESSAGES.linesInvalid })
  })

  it('TM032 picks the client message from the hint', async () => {
    expect((await map(pgError('TM032', { hint: 'required' }))).data.fields).toEqual({ clientId: SALE_MESSAGES.clientRequired })
    expect((await map(pgError('TM032', { hint: 'invalid' }))).data.fields).toEqual({ clientId: SALE_MESSAGES.clientInvalid })
  })

  it('TM034 is a 400 on deliveredDate', async () => {
    const e = await map(pgError('TM034'))
    expect(e.data).toEqual({ code: 'validation_failed', fields: { deliveredDate: SALE_MESSAGES.deliveredDateBeforeSale } })
  })

  it('TM038 is a 400 on submissionId', async () => {
    const e = await map(pgError('TM038'))
    expect(e.data).toEqual({ code: 'validation_failed', fields: { submissionId: SALE_MESSAGES.submissionReused } })
  })

  it('TM036 is a 409 sale_changed with the current sale, re-read by id', async () => {
    const { db, calls } = fakeDb({}, { data: { sale: saleRow }, error: null })
    const e = await repo.mapSaleDbError(db, pgError('TM036'), 'update', SALE_ID)
    expect(e.statusCode).toBe(409)
    expect(e.data).toEqual({ code: 'conflict', reason: 'sale_changed', sale })
    expect(calls).toEqual([['get_sale', { p_sale_id: SALE_ID, p_tenant_id: TENANT }]])
  })

  it('TM036 carries no sale when the re-read fails, or no id is known', async () => {
    const failing = fakeDb({}, { data: null, error: pgError('XX000') }).db
    expect((await repo.mapSaleDbError(failing, pgError('TM036'), 'update', SALE_ID)).data).toEqual({ code: 'conflict', reason: 'sale_changed' })
    expect((await map(pgError('TM036'), 'update')).data).toEqual({ code: 'conflict', reason: 'sale_changed' })
  })

  it('TM041 (delete: not pending) is a 409 not_pending with the current sale', async () => {
    const { db } = fakeDb({}, { data: { sale: saleRow }, error: null })
    const e = await repo.mapSaleDbError(db, pgError('TM041'), 'delete', SALE_ID)
    expect(e.data).toEqual({ code: 'conflict', reason: 'not_pending', sale })
  })

  it('TM042 (void: not complete) is a 409 not_complete with the current sale', async () => {
    const { db } = fakeDb({}, { data: { sale: saleRow }, error: null })
    const e = await repo.mapSaleDbError(db, pgError('TM042'), 'void', SALE_ID)
    expect(e.data).toEqual({ code: 'conflict', reason: 'not_complete', sale })
  })

  it('TM043 (already voided) is a 409 voided with the current sale', async () => {
    const { db } = fakeDb({}, { data: { sale: saleRow }, error: null })
    const e = await repo.mapSaleDbError(db, pgError('TM043'), 'update', SALE_ID)
    expect(e.data).toEqual({ code: 'conflict', reason: 'voided', sale })
  })

  it('TM037 (stock short) is a 409 stock_short with the shortfall parsed from DETAIL', async () => {
    const details = JSON.stringify({ shortfall: [{ sizeId: SIZE_A, onHandEggs: 210, neededEggs: 300 }] })
    const e = await map(pgError('TM037', { details }))
    expect(e.statusCode).toBe(409)
    expect(e.data).toEqual({ code: 'conflict', reason: 'stock_short', shortfall: [{ sizeId: SIZE_A, onHandEggs: 210, neededEggs: 300 }] })
  })

  it('TM037 with no parseable detail still says stock_short, with no shortfall', async () => {
    for (const details of ['', 'not json', '{"shortfall":[]}', '{"nope":true}']) {
      const e = await map(pgError('TM037', { details }))
      expect(e.data).toEqual({ code: 'conflict', reason: 'stock_short' })
    }
  })

  it('TM006, TM039, TM040 and the 23505/23514 backstops are a bare 500 that logs only the code', async () => {
    const spies = consoleSpies()
    for (const code of ['TM006', 'TM039', 'TM040', '23505', '23514', 'XX000']) {
      const e = await map(pgError(code))
      expect(e.statusCode, code).toBe(500)
      expect(e.data).toEqual({ code: 'internal' })
    }
    expect(spies[0]!.mock.calls.map(c => c[0])).toEqual([
      '[sales] database error TM006',
      '[sales] database error TM039',
      '[sales] database error TM040',
      '[sales] database error 23505',
      '[sales] database error 23514',
      '[sales] database error XX000',
    ])
  })
})

describe('no personal data or raw error content in a log or an error body (AC59)', () => {
  const SENTINEL = 'SENTINEL-Oakhill-Bakery-555-0123'

  it('a failed rpc call never logs the message, details or hint', async () => {
    const spies = consoleSpies()
    const bad = { code: 'XX000', message: SENTINEL, details: SENTINEL, hint: SENTINEL }
    await thrown(repo.createSale(fakeDb({ create_sale: { data: null, error: bad } }).db, { submissionId: SUBMISSION, type: 'on_site', saleDate: '2026-09-27', lines: [{ sizeId: SIZE_A, eggs: 30, pricePerTray: 6.5 }] }))
    await thrown(repo.getSale(fakeDb({ get_sale: { data: null, error: bad } }).db, SALE_ID))
    expect(logged(spies)).not.toContain(SENTINEL)
    const lines = spies.flatMap(s => s.mock.calls)
    expect(lines.every(c => c.length === 1 && /^\[sales\] database error [0-9A-Za-z]+$/.test(String(c[0])))).toBe(true)
  })

  it('an unexpected function result is a bare 500 that logs no data', async () => {
    const spies = consoleSpies()
    const e = await thrown(repo.createSale(fakeDb({ create_sale: { data: { nope: SENTINEL }, error: null } }).db, { submissionId: SUBMISSION, type: 'on_site', saleDate: '2026-09-27', lines: [{ sizeId: SIZE_A, eggs: 30, pricePerTray: 6.5 }] }))
    expect(e.statusCode).toBe(500)
    expect(logged(spies)).not.toContain(SENTINEL)
  })
})
