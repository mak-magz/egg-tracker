import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/types/database.types'
import { CLIENT_MESSAGES } from '../../shared/constants/clients'

vi.mock('#supabase/server', () => ({ serverSupabaseClient: vi.fn() }))

const { createTenantDbFromClient } = await import('../../server/utils/db')
const repo = await import('../../server/repositories/clients')

const TENANT = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const MAPLE = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e61'
const OAKHILL = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e62'
const SUBMISSION = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'

interface Reply { data: unknown, error: unknown }

const mapleRow = { id: MAPLE, name: 'Maple Street Market', phone: '(555) 201-3348', default_price: 6.5, archived_at: null, version: 3 }
const oakhillRow = { id: OAKHILL, name: 'Oakhill Bakery', phone: null, default_price: null, archived_at: '2026-09-01T00:00:00Z', version: 7 }
const maple = { id: MAPLE, name: 'Maple Street Market', phone: '(555) 201-3348', defaultPrice: 6.5, active: true, version: 3 }
const oakhill = { id: OAKHILL, name: 'Oakhill Bakery', phone: null, defaultPrice: null, active: false, version: 7 }

interface SelectCall { table: string, columns: string, eq: [string, string][], order: string[], single: boolean }

/**
 * A fake supabase client. `rpc` replies with `rpcReply`; every `.from(table).select(columns)` chain is recorded and
 * answered by `read`: a list (awaited after `.eq('tenant_id', ..)` and `.order(..)`) or one row (`.maybeSingle()`).
 */
function fakeDb(rpcReply: Reply, read: (call: SelectCall) => Reply = call => ({ data: call.single ? mapleRow : [oakhillRow, mapleRow], error: null })) {
  const rpcCalls: [string, Record<string, unknown>][] = []
  const selects: SelectCall[] = []
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args])
      return Promise.resolve(rpcReply)
    },
    from: (table: string) => ({
      select: (columns: string) => {
        const call: SelectCall = { table, columns, eq: [], order: [], single: false }
        selects.push(call)
        const builder: Record<string, unknown> = {
          eq: (column: string, value: string) => {
            call.eq.push([column, value])
            return builder
          },
          order: (column: string) => {
            call.order.push(column)
            return builder
          },
          maybeSingle: () => {
            call.single = true
            return Promise.resolve(read(call))
          },
          then: (resolve: (r: Reply) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(read(call)).then(resolve, reject),
        }
        return builder
      },
    }),
  }
  return { db: createTenantDbFromClient(client as unknown as SupabaseClient<Database>, TENANT), rpcCalls, selects }
}

function pgError(code: string, extra: { hint?: string, details?: string } = {}) {
  return { code, message: `error ${code}`, details: extra.details ?? '', hint: extra.hint ?? '' }
}

interface Thrown { statusCode: number, data: { code: string, fields?: Record<string, string>, reason?: string, existing?: unknown, client?: unknown } }

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

describe('toClient', () => {
  it('maps a row to the API Client: camelCase, active from archived_at, numbers as numbers', () => {
    expect(repo.toClient(mapleRow)).toEqual(maple)
    expect(repo.toClient(oakhillRow)).toEqual(oakhill)
  })

  it('reads a price or version that arrives as a string', () => {
    expect(repo.toClient({ ...mapleRow, default_price: '6.50' as unknown as number, version: '4' as unknown as number })).toMatchObject({ defaultPrice: 6.5, version: 4 })
  })
})

describe('clients repository: reads', () => {
  it('listClients reads the farm\'s clients through the tenant scope, ordered by name then id, with the shared mapper', async () => {
    const { db, selects } = fakeDb({ data: null, error: null })
    expect(await repo.listClients(db)).toEqual([oakhill, maple])
    expect(selects).toEqual([{
      table: 'clients',
      columns: 'id, name, phone, default_price, archived_at, version',
      eq: [['tenant_id', TENANT]],
      order: ['name', 'id'],
      single: false,
    }])
  })

  it('an empty farm is an empty list', async () => {
    const { db } = fakeDb({ data: null, error: null }, () => ({ data: [], error: null }))
    expect(await repo.listClients(db)).toEqual([])
  })

  it('a failed list is a bare 500 that logs only the code (AC29)', async () => {
    const spies = consoleSpies()
    const { db } = fakeDb({ data: null, error: null }, () => ({ data: null, error: { code: 'XX000', message: 'SENTINEL row (Maple Street Market)', details: 'SENTINEL', hint: 'SENTINEL' } }))
    const e = await thrown(repo.listClients(db))
    expect(e.statusCode).toBe(500)
    expect(e.data).toEqual({ code: 'internal' })
    expect(logged(spies)).toBe('[["[clients] list failed XX000"]]')
  })
})

describe('clients repository: writes', () => {
  it('addClient injects p_tenant_id from the db (never from input), omits a null phone and price, and returns the re-read client', async () => {
    const { db, rpcCalls, selects } = fakeDb({ data: { clientId: MAPLE, replayed: false }, error: null })
    const input = { submissionId: SUBMISSION, name: 'Maple Street Market', phone: null, defaultPrice: null, tenant_id: OTHER, p_tenant_id: OTHER } as never
    expect(await repo.addClient(db, input)).toEqual({ client: maple, replayed: false })
    expect(rpcCalls).toEqual([['add_client', { p_submission_id: SUBMISSION, p_name: 'Maple Street Market', p_tenant_id: TENANT }]])
    expect(rpcCalls[0]![1]).not.toHaveProperty('p_phone')
    expect(rpcCalls[0]![1]).not.toHaveProperty('p_default_price')
    // The one re-read is scoped to the tenant and names the client id.
    expect(selects).toHaveLength(1)
    expect(selects[0]).toMatchObject({ table: 'clients', eq: [['tenant_id', TENANT], ['id', MAPLE]], single: true })
  })

  it('addClient sends a phone and a price when they are set, and an omitted key means none', async () => {
    const a = fakeDb({ data: { clientId: MAPLE, replayed: false }, error: null })
    await repo.addClient(a.db, { submissionId: SUBMISSION, name: 'Maple Street Market', phone: '(555) 201-3348', defaultPrice: 6.5 })
    expect(a.rpcCalls[0]).toEqual(['add_client', { p_submission_id: SUBMISSION, p_name: 'Maple Street Market', p_phone: '(555) 201-3348', p_default_price: 6.5, p_tenant_id: TENANT }])
    const b = fakeDb({ data: { clientId: MAPLE, replayed: false }, error: null })
    await repo.addClient(b.db, { submissionId: SUBMISSION, name: 'Maple Street Market' })
    expect(Object.keys(b.rpcCalls[0]![1]).sort()).toEqual(['p_name', 'p_submission_id', 'p_tenant_id'])
  })

  it('a replayed add returns the first client with replayed: true', async () => {
    const { db } = fakeDb({ data: { clientId: MAPLE, replayed: true }, error: null })
    expect(await repo.addClient(db, { submissionId: SUBMISSION, name: 'Maple Street Market' })).toEqual({ client: maple, replayed: true })
  })

  it('updateClient sends the version and the three fields, omits null, and returns the client with changed', async () => {
    const { db, rpcCalls } = fakeDb({ data: { clientId: MAPLE, changed: true }, error: null })
    expect(await repo.updateClient(db, MAPLE, { version: 3, name: 'Maple Street Market', phone: null, defaultPrice: 7 })).toEqual({ client: maple, changed: true })
    expect(rpcCalls).toEqual([['update_client', { p_client_id: MAPLE, p_version: 3, p_name: 'Maple Street Market', p_default_price: 7, p_tenant_id: TENANT }]])
  })

  it('updateClient reports changed: false', async () => {
    const { db } = fakeDb({ data: { clientId: MAPLE, changed: false }, error: null })
    expect((await repo.updateClient(db, MAPLE, { version: 3, name: 'Maple Street Market', phone: null, defaultPrice: null })).changed).toBe(false)
  })

  it('archiveClient and restoreClient call their functions with the client id and return the client', async () => {
    const a = fakeDb({ data: { clientId: OAKHILL, changed: true }, error: null }, () => ({ data: oakhillRow, error: null }))
    expect(await repo.archiveClient(a.db, OAKHILL)).toEqual({ client: oakhill, changed: true })
    expect(a.rpcCalls[0]).toEqual(['archive_client', { p_client_id: OAKHILL, p_tenant_id: TENANT }])
    const r = fakeDb({ data: { clientId: OAKHILL, changed: false }, error: null }, () => ({ data: oakhillRow, error: null }))
    expect(await repo.restoreClient(r.db, OAKHILL)).toEqual({ client: oakhill, changed: false })
    expect(r.rpcCalls[0]).toEqual(['restore_client', { p_client_id: OAKHILL, p_tenant_id: TENANT }])
  })

  it('an rpc error is mapped, and no re-read happens', async () => {
    const { db, selects } = fakeDb({ data: null, error: pgError('TM023') })
    const e = await thrown(repo.archiveClient(db, OAKHILL))
    expect(e.statusCode).toBe(404)
    expect(selects).toEqual([])
  })

  it('an unexpected function result is a bare 500 that logs no data', async () => {
    const spies = consoleSpies()
    const { db } = fakeDb({ data: { nope: 'SENTINEL' }, error: null })
    const e = await thrown(repo.addClient(db, { submissionId: SUBMISSION, name: 'Maple Street Market' }))
    expect(e.statusCode).toBe(500)
    expect(e.data).toEqual({ code: 'internal' })
    expect(logged(spies)).toBe('[["[clients] unexpected add_client result unknown"]]')
  })

  it('a changed client that can\'t be re-read is a 500', async () => {
    const { db } = fakeDb({ data: { clientId: MAPLE, changed: true }, error: null }, () => ({ data: null, error: null }))
    const e = await thrown(repo.restoreClient(db, MAPLE))
    expect(e.statusCode).toBe(500)
  })
})

describe('mapClientDbError: every SQLSTATE of the §3.1 table', () => {
  const map = (error: ReturnType<typeof pgError>, op?: 'add' | 'update' | 'archive' | 'restore', id?: string) =>
    repo.mapClientDbError(fakeDb({ data: null, error: null }).db, error, op, id)

  it('TM017 picks the name message from the hint', async () => {
    for (const [hint, message] of [['blank', CLIENT_MESSAGES.nameBlank], ['too_long', CLIENT_MESSAGES.nameTooLong], ['invalid', CLIENT_MESSAGES.nameInvalid], ['whatever', CLIENT_MESSAGES.nameBlank], ['', CLIENT_MESSAGES.nameBlank]] as const) {
      const e = await map(pgError('TM017', { hint }), 'add')
      expect(e.statusCode, hint).toBe(400)
      expect(e.data).toEqual({ code: 'validation_failed', fields: { name: message } })
    }
  })

  it('TM018 picks the phone message from the hint', async () => {
    for (const [hint, message] of [['too_long', CLIENT_MESSAGES.phoneTooLong], ['invalid', CLIENT_MESSAGES.phoneInvalid], ['whatever', CLIENT_MESSAGES.phoneInvalid]] as const) {
      const e = await map(pgError('TM018', { hint }), 'update')
      expect(e.statusCode, hint).toBe(400)
      expect(e.data).toEqual({ code: 'validation_failed', fields: { phone: message } })
    }
  })

  it('TM019 picks the price message from the hint', async () => {
    for (const [hint, message] of [
      ['not_positive', CLIENT_MESSAGES.priceNotPositive],
      ['too_large', CLIENT_MESSAGES.priceTooLargeServer],
      ['too_many_decimals', CLIENT_MESSAGES.priceTooManyDecimals],
      ['whatever', CLIENT_MESSAGES.priceNotANumber],
    ] as const) {
      const e = await map(pgError('TM019', { hint }), 'add')
      expect(e.statusCode, hint).toBe(400)
      expect(e.data).toEqual({ code: 'validation_failed', fields: { defaultPrice: message } })
    }
  })

  it('TM020 is a 409 name_taken with the generic message and the clashing client read by id', async () => {
    const reads: SelectCall[] = []
    const { db } = fakeDb({ data: null, error: null }, (call) => {
      reads.push(call)
      return { data: { id: OAKHILL, name: 'Oakhill Bakery', archived_at: '2026-09-01T00:00:00Z' }, error: null }
    })
    const e = await repo.mapClientDbError(db, pgError('TM020', { details: JSON.stringify({ id: OAKHILL, archived: true }) }), 'add')
    expect(e.statusCode).toBe(409)
    expect(e.data).toEqual({
      code: 'conflict',
      fields: { name: 'That name already exists.' },
      reason: 'name_taken',
      existing: { id: OAKHILL, name: 'Oakhill Bakery', archived: true },
    })
    expect(reads).toEqual([{ table: 'clients', columns: 'id, name, archived_at', eq: [['tenant_id', TENANT], ['id', OAKHILL]], order: [], single: true }])
  })

  it('TM020 without a readable clash still says name_taken, with no existing', async () => {
    const details = JSON.stringify({ id: OAKHILL, archived: false })
    const failing = fakeDb({ data: null, error: null }, () => ({ data: null, error: pgError('XX000') })).db
    const missing = fakeDb({ data: null, error: null }, () => ({ data: null, error: null })).db
    const throwing = fakeDb({ data: null, error: null }, () => {
      throw new Error('network')
    }).db
    for (const db of [failing, missing, throwing]) {
      const e = await repo.mapClientDbError(db, pgError('TM020', { details }), 'add')
      expect(e.statusCode).toBe(409)
      expect(e.data).toEqual({ code: 'conflict', fields: { name: 'That name already exists.' }, reason: 'name_taken' })
    }
    for (const bad of ['', 'not json', '{"archived":true}', '{"id":5}']) {
      const e = await map(pgError('TM020', { details: bad }), 'add')
      expect(e.data).toEqual({ code: 'conflict', fields: { name: 'That name already exists.' }, reason: 'name_taken' })
    }
  })

  it('TM021 is a 409 client_limit', async () => {
    const e = await map(pgError('TM021'), 'add')
    expect(e.statusCode).toBe(409)
    expect(e.data).toEqual({ code: 'conflict', reason: 'client_limit' })
  })

  it('TM022 is a 409 client_changed with the current client, read by id', async () => {
    const reads: SelectCall[] = []
    const { db } = fakeDb({ data: null, error: null }, (call) => {
      reads.push(call)
      return { data: mapleRow, error: null }
    })
    const e = await repo.mapClientDbError(db, pgError('TM022'), 'update', MAPLE)
    expect(e.statusCode).toBe(409)
    expect(e.data).toEqual({ code: 'conflict', reason: 'client_changed', client: maple })
    expect(reads[0]).toMatchObject({ table: 'clients', eq: [['tenant_id', TENANT], ['id', MAPLE]], single: true })
  })

  it('TM022 carries no client when the read fails, or no id is known', async () => {
    const failing = fakeDb({ data: null, error: null }, () => ({ data: null, error: pgError('XX000') })).db
    const e = await repo.mapClientDbError(failing, pgError('TM022'), 'update', MAPLE)
    expect(e.data).toEqual({ code: 'conflict', reason: 'client_changed' })
    const e2 = await map(pgError('TM022'), 'update')
    expect(e2.data).toEqual({ code: 'conflict', reason: 'client_changed' })
  })

  it('TM023 (unknown or another farm\'s client) is a plain 404', async () => {
    const e = await map(pgError('TM023'), 'update', MAPLE)
    expect(e.statusCode).toBe(404)
    expect(e.data).toEqual({ code: 'not_found' })
  })

  it('TM024 is a 400 on submissionId', async () => {
    const e = await map(pgError('TM024'), 'add')
    expect(e.statusCode).toBe(400)
    expect(e.data).toEqual({ code: 'validation_failed', fields: { submissionId: 'This request was already used with different details. Try again.' } })
  })

  it('TM005 lands on the field of the operation', async () => {
    expect((await map(pgError('TM005'), 'add')).data.fields).toEqual({ submissionId: CLIENT_MESSAGES.changedElsewhere })
    expect((await map(pgError('TM005'), 'update')).data.fields).toEqual({ version: CLIENT_MESSAGES.changedElsewhere })
    expect((await map(pgError('TM005'), 'archive')).data.fields).toEqual({ id: CLIENT_MESSAGES.changedElsewhere })
    expect((await map(pgError('TM005'), 'restore')).data.fields).toEqual({ id: CLIENT_MESSAGES.changedElsewhere })
  })

  it('22P05, 22021 and PGRST102 are a name problem on add and update, and a server error otherwise', async () => {
    const spies = consoleSpies()
    for (const code of ['22P05', '22021', 'PGRST102']) {
      for (const op of ['add', 'update'] as const) {
        const e = await map(pgError(code), op)
        expect(e.statusCode, `${code} ${op}`).toBe(400)
        expect(e.data).toEqual({ code: 'validation_failed', fields: { name: CLIENT_MESSAGES.nameInvalid } })
      }
      for (const op of ['archive', 'restore', undefined] as const) {
        expect((await map(pgError(code), op)).statusCode, `${code} ${String(op)}`).toBe(500)
      }
    }
    expect(spies[0]!.mock.calls.every(c => /^\[clients\] database error (22P05|22021|PGRST102)$/.test(String(c[0])) && c.length === 1)).toBe(true)
  })

  it('TM006, TM025, TM026 and the 23505 / 23514 backstops are a bare 500 that logs only the code', async () => {
    const spies = consoleSpies()
    for (const code of ['TM006', 'TM025', 'TM026', '23505', '23514', 'XX000']) {
      const e = await map(pgError(code), 'add')
      expect(e.statusCode, code).toBe(500)
      expect(e.data).toEqual({ code: 'internal' })
    }
    expect(spies[0]!.mock.calls.map(c => c[0])).toEqual([
      '[clients] database error TM006',
      '[clients] database error TM025',
      '[clients] database error TM026',
      '[clients] database error 23505',
      '[clients] database error 23514',
      '[clients] database error XX000',
    ])
  })
})

describe('AC29: no name, phone or price in a log or an error body', () => {
  const SENTINEL = 'SENTINEL-Maple-555-0123-6.505'
  const ALL_CODES = ['TM005', 'TM006', 'TM017', 'TM018', 'TM019', 'TM020', 'TM021', 'TM022', 'TM023', 'TM024', 'TM025', 'TM026', '22P05', '22021', 'PGRST102', '23505', '23514', '22P02', '42501', 'XX000']

  // A raw database error the way Postgres writes it: values in the message, the detail, the hint.
  const dirty = (code: string) => ({
    code,
    message: `duplicate key value violates unique constraint (${SENTINEL})`,
    details: JSON.stringify({ id: OAKHILL, archived: false, name: SENTINEL, phone: SENTINEL, defaultPrice: SENTINEL }),
    hint: SENTINEL,
  })

  it('no console call and no error body contains a value from the raw error, for every SQLSTATE and operation', async () => {
    const spies = consoleSpies()
    // The reads answer with a name that is ALLOWED to leave (existing.name / client), never the sentinel.
    const { db } = fakeDb({ data: null, error: null }, call => ({ data: call.single ? { id: OAKHILL, name: 'Oakhill Bakery', phone: null, default_price: null, archived_at: null, version: 1 } : [], error: null }))
    const bodies: string[] = []
    for (const code of ALL_CODES) {
      for (const op of ['add', 'update', 'archive', 'restore', undefined] as const) {
        const e = await repo.mapClientDbError(db, dirty(code), op, OAKHILL)
        bodies.push(JSON.stringify({ statusCode: e.statusCode, statusMessage: e.statusMessage, data: e.data }))
      }
    }
    expect(bodies.length).toBe(ALL_CODES.length * 5)
    for (const body of bodies) expect(body).not.toContain(SENTINEL)
    expect(logged(spies)).not.toContain(SENTINEL)
    // What did get logged is only "[clients] <scope> <code>".
    const lines = spies.flatMap(s => s.mock.calls)
    expect(lines.every(c => c.length === 1 && /^\[clients\] database error [0-9A-Za-z]+$/.test(String(c[0])))).toBe(true)
  })

  it('a failed list, read or rpc result logs no value either', async () => {
    const spies = consoleSpies()
    const bad = { code: 'XX000', message: SENTINEL, details: SENTINEL, hint: SENTINEL }
    await thrown(repo.listClients(fakeDb({ data: null, error: null }, () => ({ data: null, error: bad })).db))
    await thrown(repo.addClient(fakeDb({ data: { clientId: SENTINEL }, error: null }, () => ({ data: null, error: bad })).db, { submissionId: SUBMISSION, name: SENTINEL, phone: SENTINEL, defaultPrice: 6.505 }))
    await thrown(repo.updateClient(fakeDb({ data: { clientId: MAPLE, changed: true }, error: null }, () => ({ data: null, error: bad })).db, MAPLE, { version: 1, name: SENTINEL, phone: SENTINEL, defaultPrice: 6.505 }))
    await thrown(repo.addClient(fakeDb({ data: null, error: bad }).db, { submissionId: SUBMISSION, name: SENTINEL, phone: SENTINEL, defaultPrice: 6.505 }))
    expect(logged(spies)).not.toContain(SENTINEL)
    expect(logged(spies)).not.toContain('6.505')
  })

  it('the only name that leaves in an error body is the clashing client\'s own (existing.name), and the request\'s own value never does', async () => {
    const { db } = fakeDb({ data: null, error: pgError('TM020', { details: JSON.stringify({ id: OAKHILL, archived: false }) }) }, () => ({ data: { id: OAKHILL, name: 'Oakhill Bakery', archived_at: null }, error: null }))
    const e = await thrown(repo.addClient(db, { submissionId: SUBMISSION, name: SENTINEL, phone: SENTINEL, defaultPrice: 6.505 }))
    const body = JSON.stringify(e.data)
    expect(body).not.toContain(SENTINEL)
    expect(body).not.toContain('6.505')
    expect(e.data.fields).toEqual({ name: 'That name already exists.' })
    expect(e.data.existing).toEqual({ id: OAKHILL, name: 'Oakhill Bakery', archived: false })
  })
})
