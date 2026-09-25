import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/types/database.types'

vi.mock('#supabase/server', () => ({ serverSupabaseClient: vi.fn() }))

const { createTenantDbFromClient } = await import('../../server/utils/db')

type Call = [method: string, ...args: unknown[]]

/** Records the builder chain supabase-js would send: from(table).method(args).eq(...) */
function fakeClient() {
  const calls: Call[] = []
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  for (const m of ['select', 'insert', 'update', 'delete', 'eq']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return chain
    }
  }
  const client = {
    from: (table: string) => {
      calls.push(['from', table])
      return chain
    },
  }
  return { client: client as unknown as SupabaseClient<Database>, calls }
}

const TENANT = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
// No tenant-scoped tables exist yet (TenantTable is `never` until production/sales/clients land).
const TABLE = 'widgets' as never

describe('TenantDb.scoped', () => {
  it('select is pre-filtered by tenant_id', () => {
    const { client, calls } = fakeClient()
    createTenantDbFromClient(client, TENANT).scoped(TABLE).select('id, name')
    expect(calls).toEqual([['from', 'widgets'], ['select', 'id, name'], ['eq', 'tenant_id', TENANT]])
  })

  it('select defaults to *', () => {
    const { client, calls } = fakeClient()
    createTenantDbFromClient(client, TENANT).scoped(TABLE).select()
    expect(calls[1]).toEqual(['select', '*'])
  })

  it('insert injects tenant_id into every row and overrides a smuggled one', () => {
    const { client, calls } = fakeClient()
    const rows = [{ name: 'a' }, { name: 'b', tenant_id: OTHER }] as never
    createTenantDbFromClient(client, TENANT).scoped(TABLE).insert(rows)
    expect(calls).toEqual([
      ['from', 'widgets'],
      ['insert', [{ name: 'a', tenant_id: TENANT }, { name: 'b', tenant_id: TENANT }]],
    ])
  })

  it('insert accepts a single row', () => {
    const { client, calls } = fakeClient()
    createTenantDbFromClient(client, TENANT).scoped(TABLE).insert({ name: 'a' } as never)
    expect(calls[1]).toEqual(['insert', [{ name: 'a', tenant_id: TENANT }]])
  })

  it('update strips tenant_id from the patch and is pre-filtered by tenant_id', () => {
    const { client, calls } = fakeClient()
    createTenantDbFromClient(client, TENANT).scoped(TABLE).update({ name: 'x', tenant_id: OTHER } as never)
    expect(calls).toEqual([['from', 'widgets'], ['update', { name: 'x' }], ['eq', 'tenant_id', TENANT]])
  })

  it('delete is pre-filtered by tenant_id', () => {
    const { client, calls } = fakeClient()
    createTenantDbFromClient(client, TENANT).scoped(TABLE).delete()
    expect(calls).toEqual([['from', 'widgets'], ['delete'], ['eq', 'tenant_id', TENANT]])
  })

  it('requires a tenant id and is frozen', () => {
    const { client } = fakeClient()
    expect(() => createTenantDbFromClient(client, '')).toThrow()
    const db = createTenantDbFromClient(client, TENANT)
    expect(Object.isFrozen(db)).toBe(true)
    expect(db.tenantId).toBe(TENANT)
  })
})

describe('TenantDb.rpc', () => {
  function rpcClient(result: { data: unknown, error: unknown } = { data: { ok: true }, error: null }) {
    const calls: [string, Record<string, unknown>][] = []
    const client = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args])
        return Promise.resolve(result)
      },
    }
    return { client: client as unknown as SupabaseClient<Database>, calls }
  }

  it('injects p_tenant_id from the db and passes the other args through', async () => {
    const { client, calls } = rpcClient()
    const res = await createTenantDbFromClient(client, TENANT).rpc('delete_production_day', { p_day: '2026-09-25' })
    expect(calls).toEqual([['delete_production_day', { p_day: '2026-09-25', p_tenant_id: TENANT }]])
    expect(res).toEqual({ data: { ok: true }, error: null })
  })

  it('drops a smuggled p_tenant_id', async () => {
    const { client, calls } = rpcClient()
    const args = { p_day: '2026-09-25', p_tenant_id: OTHER } as never
    await createTenantDbFromClient(client, TENANT).rpc('delete_production_day', args)
    expect(calls[0]![1]).toEqual({ p_day: '2026-09-25', p_tenant_id: TENANT })
  })

  it('returns the PostgREST error instead of throwing', async () => {
    const error = { code: 'TM003', message: 'day has no production', details: '', hint: '' }
    const { client } = rpcClient({ data: null, error })
    const res = await createTenantDbFromClient(client, TENANT).rpc('delete_production_day', { p_day: '2026-09-25' })
    expect(res).toEqual({ data: null, error })
  })
})
