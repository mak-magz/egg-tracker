/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { requireAdmin } from '../../server/utils/auth'
import * as authUtils from '../../server/utils/auth'
import { listAdminTenants, getAdminTenantDetails } from '../../server/repositories/admin-tenants'
import { runBatchMigrations } from '../../server/repositories/admin-migrations'
import * as tursoDb from '../../server/db/turso'
import * as adminAudit from '../../server/repositories/admin-audit'

describe('Admin Authorization (requireAdmin)', () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails
  })

  function makeMockEvent(email: string, userId = 'user-123'): H3Event {
    return {
      context: {
        tamagoAuth: Promise.resolve({ userId, email }),
      },
    } as unknown as H3Event
  }

  it('allows access when user email matches single ADMIN_EMAILS entry', async () => {
    process.env.ADMIN_EMAILS = 'admin@tamago.farm'
    const event = makeMockEvent('admin@tamago.farm')
    const ctx = await requireAdmin(event)
    expect(ctx.email).toBe('admin@tamago.farm')
    expect(ctx.userId).toBe('user-123')
  })

  it('allows access with case-insensitive and trimmed email matching in comma-separated list', async () => {
    process.env.ADMIN_EMAILS = ' Ops@Tamago.Farm , admin@example.com '
    const event = makeMockEvent('ops@tamago.farm')
    const ctx = await requireAdmin(event)
    expect(ctx.email).toBe('ops@tamago.farm')
  })

  it('throws 403 forbidden when user email is not in ADMIN_EMAILS', async () => {
    process.env.ADMIN_EMAILS = 'admin@tamago.farm'
    const event = makeMockEvent('farmer@farm.com')
    await expect(requireAdmin(event)).rejects.toMatchObject({
      statusCode: 403,
      data: { code: 'forbidden' },
    })
  })

  it('throws 403 forbidden when ADMIN_EMAILS is unset or empty', async () => {
    process.env.ADMIN_EMAILS = '   '
    const event = makeMockEvent('admin@tamago.farm')
    await expect(requireAdmin(event)).rejects.toMatchObject({
      statusCode: 403,
      data: { code: 'forbidden' },
    })
  })
})

describe('Admin Tenant Secrets Sanitization', () => {
  const mockTenant = {
    id: 't-test-1',
    name: 'Test Pastures',
    tier: 'premium',
    eggsPerTray: 30,
    currency: 'PHP',
    dbUrl: 'libsql://test-pastures-tamago.turso.io',
    dbAuthToken: 'TURSO_SECRET_TOKEN_NEVER_LEAK_123',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([mockTenant]),
        }),
      }),
    } as any)
    vi.spyOn(authUtils, 'getFirebaseAdminAuth').mockReturnValue({
      getUser: vi.fn().mockResolvedValue({ email: 'owner@test.farm' }),
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sanitizes secret dbAuthToken in listAdminTenants', async () => {
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: () => Promise.resolve([mockTenant]),
      }),
    } as any)

    const res = await listAdminTenants()
    expect(res.tenants.length).toBe(1)
    const t = res.tenants[0]
    expect(t.hasToken).toBe(true)
    expect((t as any).dbAuthToken).toBeUndefined()
  })

  it('sanitizes secret dbAuthToken in getAdminTenantDetails', async () => {
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([mockTenant]),
        }),
      }),
    } as any)

    const res = await getAdminTenantDetails('t-test-1')
    expect(res.tenant.hasToken).toBe(true)
    expect((res.tenant as any).dbAuthToken).toBeUndefined()
  })
})

describe('Admin Batch Migrations Failure Isolation', () => {
  const tenants = [
    {
      id: 'tenant-good',
      name: 'Good Farm',
      dbUrl: 'file:local-good.db',
      dbAuthToken: null,
    },
    {
      id: 'tenant-bad',
      name: 'Bad Farm',
      dbUrl: 'libsql://bad-farm.turso.io',
      dbAuthToken: 'token',
    },
  ]

  beforeEach(() => {
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: () => Promise.resolve(tenants),
      }),
    } as any)
    vi.spyOn(adminAudit, 'recordAdminAuditLog').mockResolvedValue({} as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('isolates failures: continuing batch migration when one tenant throws', async () => {
    let callCount = 0
    vi.spyOn(tursoDb, 'initTenantDbSchema').mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        throw new Error('Connection timeout to edge database')
      }
      return Promise.resolve()
    })

    const res = await runBatchMigrations(undefined, 'operator@tamago.farm')
    expect(res.totalMigrated).toBe(2)
    expect(res.successful).toBe(1)
    expect(res.failed).toBe(1)

    const goodResult = res.results.find(r => r.tenantId === 'tenant-good')
    const badResult = res.results.find(r => r.tenantId === 'tenant-bad')

    expect(goodResult?.success).toBe(true)
    expect(badResult?.success).toBe(false)
    expect(badResult?.error).toBe('Connection timeout to edge database')
  })
})
