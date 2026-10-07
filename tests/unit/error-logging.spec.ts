import { afterEach, describe, expect, it, vi } from 'vitest'
import { onHandQuerySchema, salesListQuerySchema } from '../../shared/schemas/sales'
import { ordersQuerySchema } from '../../shared/schemas/orders'
import { RepositoryError, toApiError } from '../../server/utils/errors'
import { mapProductionDbError } from '../../server/repositories/production'

const SECRET = 'Maria Santos 0917-555-0100'

afterEach(() => vi.restoreAllMocks())

describe('error logging keeps row values out of logs', () => {
  it('toApiError logs only name and code', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    toApiError(Object.assign(new Error(SECRET), { code: '23505', details: SECRET }))
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Maria')
    expect(JSON.stringify(spy.mock.calls)).toContain('23505')
  })
  it('production mapper logs the SQLSTATE only', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mapProductionDbError({ code: 'XX000', message: SECRET })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Maria')
    expect(JSON.stringify(spy.mock.calls)).toContain('XX000')
  })
  it('RepositoryError carries only the code', () => {
    const e = new RepositoryError('lookup failed', '42501')
    expect(e.code).toBe('42501')
    expect(e.message).toBe('lookup failed')
  })
})

describe('list query bounds', () => {
  it('caps offset at 1,000,000 on sales and orders', () => {
    expect(salesListQuerySchema.safeParse({ offset: '1000000' }).success).toBe(true)
    expect(salesListQuerySchema.safeParse({ offset: '1000001' }).success).toBe(false)
    expect(ordersQuerySchema.safeParse({ offset: '1000001' }).success).toBe(false)
  })
  it('caps the on-hand sizeId list at 50', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `0b8f0f0e-6a54-4c1e-9d7e-${String(i).padStart(12, '0')}`)
    expect(onHandQuerySchema.safeParse({ sizeId: ids(50) }).success).toBe(true)
    expect(onHandQuerySchema.safeParse({ sizeId: ids(51) }).success).toBe(false)
  })
})
