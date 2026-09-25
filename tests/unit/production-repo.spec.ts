import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/types/database.types'
import { PRODUCTION_MESSAGES } from '../../shared/constants/production'
import { logProductionBodySchema, productionAmountsSchema } from '../../shared/schemas/production'

vi.mock('#supabase/server', () => ({ serverSupabaseClient: vi.fn() }))

const { createTenantDbFromClient } = await import('../../server/utils/db')
const { zodFields, validateInput } = await import('../../server/utils/errors')
const repo = await import('../../server/repositories/production')

const TENANT = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const LARGE = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e63'
const SMALL = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e61'

const day = { date: '2026-08-04', good: [{ sizeId: SMALL, eggs: 42 }, { sizeId: LARGE, eggs: 264 }], goodTotal: 306, rejects: 5 }

function fakeDb(result: { data: unknown, error: unknown }) {
  const calls: [string, Record<string, unknown>][] = []
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args])
      return Promise.resolve(result)
    },
  }
  return { db: createTenantDbFromClient(client as unknown as SupabaseClient<Database>, TENANT), calls }
}

function pgError(code: string) {
  return { code, message: `error ${code}`, details: '', hint: '' }
}

async function thrown(p: Promise<unknown>) {
  try {
    await p
  }
  catch (e) {
    return e as { statusCode: number, data: { code: string, fields?: Record<string, string> } }
  }
  throw new Error('expected a rejection')
}

describe('production repository', () => {
  it('logProduction splits good into arrays, injects p_tenant_id from the db, maps hadBefore', async () => {
    const { db, calls } = fakeDb({ data: { day, hadBefore: true, replayed: false }, error: null })
    const input = {
      submissionId: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
      date: '2026-08-04',
      good: [{ sizeId: SMALL, eggs: 42 }, { sizeId: LARGE, eggs: 0 }],
      rejects: 5,
      tenant_id: OTHER,
      p_tenant_id: OTHER,
    } as never
    const res = await repo.logProduction(db, input)
    expect(calls).toEqual([['log_production', {
      p_submission_id: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
      p_day: '2026-08-04',
      p_size_ids: [SMALL, LARGE],
      p_eggs: [42, 0],
      p_rejects: 5,
      p_tenant_id: TENANT,
    }]])
    expect(res).toEqual({ day, hadProductionBefore: true, replayed: false })
  })

  it('listProductionDays passes the range and returns the payload', async () => {
    const { db, calls } = fakeDb({ data: { hasAny: true, days: [day] }, error: null })
    expect(await repo.listProductionDays(db, { from: '2026-08-01', to: '2026-08-31' })).toEqual({ hasAny: true, days: [day] })
    expect(calls[0]).toEqual(['production_days', { p_from: '2026-08-01', p_to: '2026-08-31', p_tenant_id: TENANT }])
  })

  it('getProductionDay returns the day or null', async () => {
    const hit = fakeDb({ data: { hasAny: true, days: [day] }, error: null })
    expect(await repo.getProductionDay(hit.db, '2026-08-04')).toEqual(day)
    expect(hit.calls[0]![1]).toEqual({ p_from: '2026-08-04', p_to: '2026-08-04', p_tenant_id: TENANT })
    const miss = fakeDb({ data: { hasAny: true, days: [] }, error: null })
    expect(await repo.getProductionDay(miss.db, '2026-08-05')).toBeNull()
  })

  it('replaceProductionDay and deleteProductionDay call their functions and unwrap the day', async () => {
    const r = fakeDb({ data: { day }, error: null })
    expect(await repo.replaceProductionDay(r.db, '2026-08-04', { good: [{ sizeId: LARGE, eggs: 30 }], rejects: 0 })).toEqual(day)
    expect(r.calls[0]).toEqual(['replace_production_day',
      { p_day: '2026-08-04', p_size_ids: [LARGE], p_eggs: [30], p_rejects: 0, p_tenant_id: TENANT }])
    const d = fakeDb({ data: { removed: day }, error: null })
    expect(await repo.deleteProductionDay(d.db, '2026-08-04')).toEqual(day)
    expect(d.calls[0]).toEqual(['delete_production_day', { p_day: '2026-08-04', p_tenant_id: TENANT }])
  })

  it('an unexpected function result is a 500, not a malformed response', async () => {
    const { db } = fakeDb({ data: { day: { date: '2026-08-04' } }, error: null })
    const e = await thrown(repo.replaceProductionDay(db, '2026-08-04', { good: [], rejects: 1 }))
    expect(e.statusCode).toBe(500)
    expect(e.data.code).toBe('internal')
  })

  it.each([
    ['TM001', 400, 'validation_failed', { sizes: PRODUCTION_MESSAGES.sizesChanged }],
    ['TM002', 400, 'validation_failed', { date: PRODUCTION_MESSAGES.futureDate }],
    ['TM003', 404, 'not_found', undefined],
    ['TM004', 400, 'validation_failed', { amounts: PRODUCTION_MESSAGES.nothingEntered }],
    ['TM005', 400, 'validation_failed', { amounts: PRODUCTION_MESSAGES.invalidAmounts }],
    ['TM006', 500, 'internal', undefined],
    ['TM007', 400, 'validation_failed', { amounts: PRODUCTION_MESSAGES.tooLarge }],
    ['23503', 400, 'validation_failed', { sizes: PRODUCTION_MESSAGES.sizesChanged }],
    ['23514', 400, 'validation_failed', { amounts: PRODUCTION_MESSAGES.invalidAmounts }],
    ['22003', 400, 'validation_failed', { amounts: PRODUCTION_MESSAGES.tooLarge }],
    ['PGRST202', 500, 'internal', undefined],
  ])('maps SQLSTATE %s to %i %s', async (sqlstate, status, code, fields) => {
    const { db } = fakeDb({ data: null, error: pgError(sqlstate) })
    const e = await thrown(repo.deleteProductionDay(db, '2026-08-04'))
    expect(e.statusCode).toBe(status)
    expect(e.data).toEqual(fields ? { code, fields } : { code })
  })
})

describe('zodFields / validateInput', () => {
  it('maps good.<index> to good.<sizeId> from the input', () => {
    const input = { good: [{ sizeId: SMALL, eggs: 1 }, { sizeId: LARGE, eggs: -1 }], rejects: 1.5 }
    const r = productionAmountsSchema.safeParse(input)
    expect(r.success).toBe(false)
    expect(zodFields(r.error!, input)).toEqual({
      [`good.${LARGE}`]: PRODUCTION_MESSAGES.notWholeNumber,
      rejects: PRODUCTION_MESSAGES.notWholeNumber,
    })
  })

  it('falls back to amounts when the line has no usable sizeId, and keeps object-level keys', () => {
    const input = { good: [{ eggs: 1 }], rejects: 0 }
    const r = productionAmountsSchema.safeParse(input)
    expect(zodFields(r.error!, input)).toEqual({ amounts: expect.any(String) })
    const empty = { good: [], rejects: 0 }
    expect(zodFields(productionAmountsSchema.safeParse(empty).error!, empty)).toEqual({ amounts: PRODUCTION_MESSAGES.nothingEntered })
  })

  it('validateInput returns parsed data (unknown keys stripped) or throws 400 with fields', () => {
    expect(validateInput(productionAmountsSchema, { good: [], rejects: 2, tenant_id: OTHER })).toEqual({ good: [], rejects: 2 })
    let err: { statusCode: number, data: unknown } | undefined
    try {
      validateInput(logProductionBodySchema, { good: [], rejects: 1, submissionId: 'x', date: '2026-02-30' })
    }
    catch (e) {
      err = e as typeof err
    }
    expect(err?.statusCode).toBe(400)
    expect(err?.data).toEqual({
      code: 'validation_failed',
      fields: { submissionId: expect.any(String), date: PRODUCTION_MESSAGES.dateRequired },
    })
  })
})
