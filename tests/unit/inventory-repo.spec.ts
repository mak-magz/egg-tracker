import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/types/database.types'

vi.mock('#supabase/server', () => ({ serverSupabaseClient: vi.fn() }))

const { createTenantDbFromClient } = await import('../../server/utils/db')
const { getInventory } = await import('../../server/repositories/inventory')

const TENANT = '11111111-1111-1111-1111-111111111111'
const SIZE = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e62'

const payload = {
  hasAny: true,
  sizes: [
    { id: SIZE, name: 'Large', sortOrder: 2, colorSlot: 2, active: true, onHandEggs: -60, owedEggs: 300 },
  ],
}

function fakeDb(reply: { data: unknown, error: unknown }) {
  const calls: [string, Record<string, unknown>][] = []
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args])
      return Promise.resolve(reply)
    },
  }
  return { db: createTenantDbFromClient(client as unknown as SupabaseClient<Database>, TENANT), calls }
}

const spies = () => (['error', 'warn', 'log', 'info', 'debug'] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

describe('getInventory', () => {
  it('calls get_inventory with only the server-set tenant and returns the payload (negatives kept)', async () => {
    const { db, calls } = fakeDb({ data: payload, error: null })
    expect(await getInventory(db)).toEqual(payload)
    expect(calls).toEqual([['get_inventory', { p_tenant_id: TENANT }]])
  })

  it('a database error is 500 internal and logs the SQLSTATE only', async () => {
    const s = spies()
    const { db } = fakeDb({ data: null, error: { code: 'TM006', message: 'secret row value', details: 'x', hint: 'y' } })
    await expect(getInventory(db)).rejects.toMatchObject({ statusCode: 500, data: { code: 'internal' } })
    const out = JSON.stringify(s.flatMap(x => x.mock.calls))
    expect(out).toContain('TM006')
    expect(out).not.toContain('secret row value')
  })

  it('a result of the wrong shape is 500 internal', async () => {
    spies()
    for (const bad of [null, { hasAny: true }, { hasAny: true, sizes: [{ ...payload.sizes[0], owedEggs: -1 }] }, { hasAny: 'yes', sizes: [] }]) {
      await expect(getInventory(fakeDb({ data: bad, error: null }).db)).rejects.toMatchObject({ statusCode: 500 })
    }
  })
})
