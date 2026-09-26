import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/types/database.types'
import { SIZE_MESSAGES } from '../../shared/constants/sizes'

vi.mock('#supabase/server', () => ({ serverSupabaseClient: vi.fn() }))

const { createTenantDbFromClient } = await import('../../server/utils/db')
const repo = await import('../../server/repositories/sizes')
const { toFarmSizes } = await import('../../server/repositories/tenants')

const TENANT = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const SMALL = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e61'
const LARGE = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e63'
const JUMBO = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e64'

interface Reply { data: unknown, error: unknown }

// Rows exactly as the database returns them (deliberately out of order: the mapper sorts).
const rows = [
  { id: JUMBO, name: 'Jumbo', sort_order: 3, color_slot: 3, archived_at: '2026-09-01T00:00:00Z' },
  { id: SMALL, name: 'Small', sort_order: 0, color_slot: 0, archived_at: null },
  { id: LARGE, name: 'Large', sort_order: 1, color_slot: 2, archived_at: null },
]
const sizes = [
  { id: SMALL, name: 'Small', sortOrder: 0, colorSlot: 0, active: true },
  { id: LARGE, name: 'Large', sortOrder: 1, colorSlot: 2, active: true },
  { id: JUMBO, name: 'Jumbo', sortOrder: 3, colorSlot: 3, active: false },
]

/** A fake supabase client: `rpc` replies with `rpcReply`, `.from('sizes').select().eq()` replies with `listReply`. */
function fakeDb(rpcReply: Reply, listReply: Reply = { data: rows, error: null }) {
  const rpcCalls: [string, Record<string, unknown>][] = []
  const selects: { table: string, columns: string, eq: [string, string][] }[] = []
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args])
      return Promise.resolve(rpcReply)
    },
    from: (table: string) => ({
      select: (columns: string) => {
        const call = { table, columns, eq: [] as [string, string][] }
        selects.push(call)
        return {
          eq: (column: string, value: string) => {
            call.eq.push([column, value])
            return Promise.resolve(listReply)
          },
        }
      },
    }),
  }
  return { db: createTenantDbFromClient(client as unknown as SupabaseClient<Database>, TENANT), rpcCalls, selects }
}

function pgError(code: string, details = '') {
  return { code, message: `error ${code}`, details, hint: '' }
}

interface Thrown { statusCode: number, data: { code: string, fields?: Record<string, string>, reason?: string, existing?: unknown, sizes?: unknown } }

async function thrown(p: Promise<unknown>): Promise<Thrown> {
  try {
    await p
  }
  catch (e) {
    return e as Thrown
  }
  throw new Error('expected a rejection')
}

describe('toFarmSizes', () => {
  it('maps rows to FarmSize and sorts by sortOrder, name, id', () => {
    expect(toFarmSizes(rows)).toEqual(sizes)
    expect(toFarmSizes(null)).toEqual([])
  })
})

describe('sizes repository', () => {
  it('listSizes reads the farm\'s sizes through the tenant scope and the shared mapper', async () => {
    const { db, selects } = fakeDb({ data: null, error: null })
    expect(await repo.listSizes(db)).toEqual(sizes)
    expect(selects).toEqual([{ table: 'sizes', columns: 'id, name, sort_order, color_slot, archived_at', eq: [['tenant_id', TENANT]] }])
  })

  it('a failed list is a logged 500', async () => {
    const { db } = fakeDb({ data: null, error: null }, { data: null, error: pgError('XX000') })
    const e = await thrown(repo.listSizes(db))
    expect(e.statusCode).toBe(500)
    expect(e.data).toEqual({ code: 'internal' })
  })

  it('addSize injects p_tenant_id from the db, never from input, and returns { sizes, changedId }', async () => {
    const { db, rpcCalls } = fakeDb({ data: { changedId: LARGE, replayed: false }, error: null })
    const input = { submissionId: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'Peewee', tenant_id: OTHER, p_tenant_id: OTHER } as never
    expect(await repo.addSize(db, input)).toEqual({ sizes, changedId: LARGE })
    expect(rpcCalls).toEqual([['add_size', { p_submission_id: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', p_name: 'Peewee', p_tenant_id: TENANT }]])
  })

  it('a replayed add still returns the first size', async () => {
    const { db } = fakeDb({ data: { changedId: SMALL, replayed: true }, error: null })
    expect((await repo.addSize(db, { submissionId: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'Small' })).changedId).toBe(SMALL)
  })

  it('renameSize, archiveSize and restoreSize call their functions with the size id', async () => {
    const r = fakeDb({ data: { changedId: LARGE }, error: null })
    expect(await repo.renameSize(r.db, LARGE, 'Big')).toEqual({ sizes, changedId: LARGE })
    expect(r.rpcCalls[0]).toEqual(['rename_size', { p_size_id: LARGE, p_name: 'Big', p_tenant_id: TENANT }])
    const a = fakeDb({ data: { changedId: JUMBO }, error: null })
    expect(await repo.archiveSize(a.db, JUMBO)).toEqual({ sizes, changedId: JUMBO })
    expect(a.rpcCalls[0]).toEqual(['archive_size', { p_size_id: JUMBO, p_tenant_id: TENANT }])
    const s = fakeDb({ data: { changedId: JUMBO }, error: null })
    expect(await repo.restoreSize(s.db, JUMBO)).toEqual({ sizes, changedId: JUMBO })
    expect(s.rpcCalls[0]).toEqual(['restore_size', { p_size_id: JUMBO, p_tenant_id: TENANT }])
  })

  it('reorderSizes sends the whole order and reports the moved size as changedId', async () => {
    const { db, rpcCalls } = fakeDb({ data: { changed: true }, error: null })
    const res = await repo.reorderSizes(db, { sizeId: LARGE, order: [LARGE, SMALL] })
    expect(rpcCalls[0]).toEqual(['reorder_sizes', { p_size_ids: [LARGE, SMALL], p_tenant_id: TENANT }])
    expect(res).toEqual({ sizes, changedId: LARGE })
  })

  it('an unexpected function result is a 500, not a malformed response', async () => {
    const { db } = fakeDb({ data: { nope: true }, error: null })
    const e = await thrown(repo.archiveSize(db, JUMBO))
    expect(e.statusCode).toBe(500)
    expect(e.data.code).toBe('internal')
  })

  it('a failed re-read after a write is a 500 (the write itself has landed)', async () => {
    const { db } = fakeDb({ data: { changedId: LARGE }, error: null }, { data: null, error: pgError('XX000') })
    const e = await thrown(repo.renameSize(db, LARGE, 'Big'))
    expect(e.statusCode).toBe(500)
  })
})

describe('mapSizeDbError', () => {
  const existingActive = { id: LARGE, name: 'Large', archived: false }
  const existingArchived = { id: JUMBO, name: 'Jumbo', archived: true }

  it.each([
    ['TM008', 400, 'validation_failed', { name: SIZE_MESSAGES.nameBlank }],
    ['TM013', 400, 'validation_failed', { submissionId: expect.any(String) }],
    ['TM015', 400, 'validation_failed', { name: SIZE_MESSAGES.tooMany }],
    ['TM006', 500, 'internal', undefined],
    ['TM014', 500, 'internal', undefined],
    ['23505', 500, 'internal', undefined],
    ['23514', 500, 'internal', undefined],
    ['PGRST202', 500, 'internal', undefined],
  ])('maps SQLSTATE %s to %i %s (no sizes attached)', async (sqlstate, status, code, fields) => {
    const { db, selects } = fakeDb({ data: null, error: pgError(sqlstate) })
    const e = await thrown(repo.archiveSize(db, JUMBO))
    expect(e.statusCode).toBe(status)
    expect(e.data).toEqual(fields ? { code, fields } : { code })
    expect(selects).toEqual([]) // no follow-up read for these
  })

  it.each(['22P05', '22021', 'PGRST102'])('%s (text Postgres cannot store) on an add or rename is a 400 on fields.name', async (sqlstate) => {
    const add = await thrown(repo.addSize(fakeDb({ data: null, error: pgError(sqlstate) }).db, { submissionId: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'X' }))
    expect(add.statusCode).toBe(400)
    expect(add.data).toEqual({ code: 'validation_failed', fields: { name: SIZE_MESSAGES.nameInvalid } })
    const rename = await thrown(repo.renameSize(fakeDb({ data: null, error: pgError(sqlstate) }).db, SMALL, 'X'))
    expect(rename.statusCode).toBe(400)
    expect(rename.data).toEqual({ code: 'validation_failed', fields: { name: SIZE_MESSAGES.nameInvalid } })
    expect(await repo.mapSizeDbError(fakeDb({ data: null, error: null }).db, pgError(sqlstate))).toMatchObject({ statusCode: 400 })
  })

  it('22P05 from a call that carries no name (archive) stays a 500 internal', async () => {
    const e = await thrown(repo.archiveSize(fakeDb({ data: null, error: pgError('22P05') }).db, JUMBO))
    expect(e.statusCode).toBe(500)
    expect(e.data).toEqual({ code: 'internal' })
  })

  it('TM005 lands on submissionId for an add and on order for a reorder', async () => {
    const add = await thrown(repo.addSize(fakeDb({ data: null, error: pgError('TM005') }).db, { submissionId: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'X' }))
    expect(add.statusCode).toBe(400)
    expect(Object.keys(add.data.fields!)).toEqual(['submissionId'])
    const reorder = await thrown(repo.reorderSizes(fakeDb({ data: null, error: pgError('TM005') }).db, { sizeId: LARGE, order: [LARGE] }))
    expect(Object.keys(reorder.data.fields!)).toEqual(['order'])
  })

  it('TM009 parses the clashing size from the detail; an active match reads "already have"', async () => {
    const { db } = fakeDb({ data: null, error: pgError('TM009', JSON.stringify(existingActive)) })
    const e = await thrown(repo.renameSize(db, SMALL, 'large'))
    expect(e.statusCode).toBe(409)
    expect(e.data).toEqual({
      code: 'conflict',
      fields: { name: SIZE_MESSAGES.nameTaken('Large') },
      reason: 'name_taken',
      existing: existingActive,
    })
  })

  it('TM009 with an archived match points to Restore and carries the id', async () => {
    const { db } = fakeDb({ data: null, error: pgError('TM009', JSON.stringify(existingArchived)) })
    const e = await thrown(repo.addSize(db, { submissionId: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'jumbo' }))
    expect(e.data.reason).toBe('name_taken')
    expect(e.data.existing).toEqual(existingArchived)
    expect(e.data.fields).toEqual({ name: SIZE_MESSAGES.nameArchived('Jumbo') })
  })

  it('TM009 with an unreadable detail is still a 409 name_taken, with a field message and no existing', async () => {
    for (const details of ['', 'not json', '{"id":1}']) {
      const { db } = fakeDb({ data: null, error: pgError('TM009', details) })
      const e = await thrown(repo.renameSize(db, SMALL, 'large'))
      expect(e.statusCode).toBe(409)
      expect(e.data.reason).toBe('name_taken')
      expect(e.data.existing).toBeUndefined()
      expect(e.data.fields).toEqual({ name: expect.any(String) })
    }
  })

  it.each([
    ['TM010', 409, 'conflict', 'last_active_size'],
    ['TM011', 404, 'not_found', undefined],
    ['TM012', 409, 'conflict', 'sizes_changed'],
  ])('%s attaches the CURRENT sizes (status %i)', async (sqlstate, status, code, reason) => {
    const { db, selects } = fakeDb({ data: null, error: pgError(sqlstate) })
    const e = await thrown(repo.archiveSize(db, JUMBO))
    expect(e.statusCode).toBe(status)
    expect(e.data).toEqual(reason ? { code, reason, sizes } : { code, sizes })
    expect(selects).toHaveLength(1)
  })

  it.each(['TM010', 'TM011', 'TM012'])('%s is thrown WITHOUT sizes when the follow-up read fails too', async (sqlstate) => {
    const { db } = fakeDb({ data: null, error: pgError(sqlstate) }, { data: null, error: pgError('XX000') })
    const e = await thrown(repo.restoreSize(db, JUMBO))
    expect('sizes' in e.data).toBe(false)
    expect(e.statusCode).toBe(sqlstate === 'TM011' ? 404 : 409)
  })
})
