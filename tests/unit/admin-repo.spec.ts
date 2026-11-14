/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { requireAdmin } from '../../server/utils/auth'
import * as authUtils from '../../server/utils/auth'
import { listAdminTenants, getAdminTenantDetails } from '../../server/repositories/admin-tenants'
import { getFleetMigrationStatus, runBatchMigrations, runSingleTenantMigration } from '../../server/repositories/admin-migrations'
import { assignUserToFarm, reassignUserFarm, listFirebaseUsers } from '../../server/repositories/admin-users'
import * as tursoDb from '../../server/db/turso'
import * as controlSchema from '../../server/db/schema/control'
import * as adminAudit from '../../server/repositories/admin-audit'

describe('Admin Authorization (requireAdmin)', () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS
  let mockAdmins: any[] = []
  let insertedAdmins: any[] = []

  beforeEach(() => {
    mockAdmins = []
    insertedAdmins = []
    vi.spyOn(tursoDb, 'ensureControlDbBootstrapped').mockResolvedValue(undefined)
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: () => ({
          where: vi.fn().mockImplementation(() => Promise.resolve(mockAdmins)),
        }),
      }),
      insert: () => ({
        values: vi.fn().mockImplementation((val: any) => {
          insertedAdmins.push(val)
          return Promise.resolve()
        }),
      }),
    } as any)
  })

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails
    vi.restoreAllMocks()
  })

  function makeMockEvent(email: string, userId = 'user-123'): H3Event {
    return {
      context: {
        tamagoAuth: Promise.resolve({ userId, email }),
      },
    } as unknown as H3Event
  }

  it('allows access when user is active in admins table', async () => {
    process.env.ADMIN_EMAILS = ''
    mockAdmins = [{ id: 'adm-1', userId: 'user-123', email: 'admin@tamago.farm', role: 'superadmin', isActive: 1 }]
    const event = makeMockEvent('admin@tamago.farm')
    const ctx = await requireAdmin(event)
    expect(ctx.email).toBe('admin@tamago.farm')
    expect(ctx.userId).toBe('user-123')
  })

  it('throws 403 forbidden when user is inactive in admins table', async () => {
    process.env.ADMIN_EMAILS = 'admin@tamago.farm'
    mockAdmins = [{ id: 'adm-1', userId: 'user-123', email: 'admin@tamago.farm', role: 'superadmin', isActive: 0 }]
    const event = makeMockEvent('admin@tamago.farm')
    await expect(requireAdmin(event)).rejects.toMatchObject({
      statusCode: 403,
      data: { code: 'forbidden' },
    })
  })

  it('allows access and inserts into admins table when user matches ADMIN_EMAILS fallback', async () => {
    process.env.ADMIN_EMAILS = 'admin@tamago.farm'
    mockAdmins = []
    const event = makeMockEvent('admin@tamago.farm', 'user-new')
    const ctx = await requireAdmin(event)
    expect(ctx.email).toBe('admin@tamago.farm')
    expect(ctx.userId).toBe('user-new')
    expect(insertedAdmins.length).toBe(1)
    expect(insertedAdmins[0]).toMatchObject({
      userId: 'user-new',
      email: 'admin@tamago.farm',
      role: 'superadmin',
      isActive: 1,
    })
  })

  it('allows access with case-insensitive and trimmed email matching in comma-separated list', async () => {
    process.env.ADMIN_EMAILS = ' Ops@Tamago.Farm , admin@example.com '
    mockAdmins = []
    const event = makeMockEvent('ops@tamago.farm')
    const ctx = await requireAdmin(event)
    expect(ctx.email).toBe('ops@tamago.farm')
  })

  it('throws 403 forbidden when user email is not in ADMIN_EMAILS', async () => {
    process.env.ADMIN_EMAILS = 'admin@tamago.farm'
    mockAdmins = []
    const event = makeMockEvent('farmer@farm.com')
    await expect(requireAdmin(event)).rejects.toMatchObject({
      statusCode: 403,
      data: { code: 'forbidden' },
    })
  })

  it('throws 403 forbidden when ADMIN_EMAILS is unset or empty', async () => {
    process.env.ADMIN_EMAILS = '   '
    mockAdmins = []
    const event = makeMockEvent('admin@tamago.farm')
    await expect(requireAdmin(event)).rejects.toMatchObject({
      statusCode: 403,
      data: { code: 'forbidden' },
    })
  })
})

describe('Platform Operator Isolation in User Assignment', () => {
  const mockTenant = { id: 't-1', name: 'Pastures Farm' }
  const mockMembership = { id: 'm-1', tenantId: 't-old', userId: 'user-operator' }

  beforeEach(() => {
    vi.spyOn(tursoDb, 'ensureControlDbBootstrapped').mockResolvedValue(undefined)
    vi.spyOn(adminAudit, 'recordAdminAuditLog').mockResolvedValue({} as any)
    vi.spyOn(authUtils, 'getFirebaseAdminAuth').mockReturnValue({
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
      listUsers: vi.fn().mockResolvedValue({
        users: [
          { uid: 'op-1', email: 'op@tamago.farm', emailVerified: true, metadata: {} },
          { uid: 'cust-1', email: 'cust@farm.com', emailVerified: true, metadata: {} },
        ],
      }),
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prevents assignUserToFarm for active platform operators', async () => {
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: (table: any) => ({
          where: vi.fn().mockImplementation(() => {
            if (table === controlSchema.tenants) return Promise.resolve([mockTenant])
            if (table === controlSchema.admins) return Promise.resolve([{ id: 'adm-1', userId: 'op-1', isActive: 1 }])
            return Promise.resolve([])
          }),
        }),
      }),
    } as any)

    await expect(assignUserToFarm('op-1', 't-1', 'admin@tamago.farm')).rejects.toMatchObject({
      statusCode: 400,
      data: { code: 'bad_request' },
    })
  })

  it('prevents reassignUserFarm for active platform operators', async () => {
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: (table: any) => ({
          where: vi.fn().mockImplementation(() => {
            if (table === controlSchema.tenants) return Promise.resolve([mockTenant])
            if (table === controlSchema.admins) return Promise.resolve([{ id: 'adm-1', userId: 'op-1', isActive: 1 }])
            if (table === controlSchema.memberships) return Promise.resolve([mockMembership])
            return Promise.resolve([])
          }),
        }),
      }),
    } as any)

    await expect(reassignUserFarm('op-1', 't-1', 'admin@tamago.farm')).rejects.toMatchObject({
      statusCode: 400,
      data: { code: 'bad_request' },
    })
  })

  it('decorates users with admin metadata in listFirebaseUsers', async () => {
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: (table: any) => {
          if (table === controlSchema.memberships) return Promise.resolve([])
          if (table === controlSchema.tenants) return Promise.resolve([])
          if (table === controlSchema.admins) {
            return Promise.resolve([
              { id: 'adm-1', userId: 'op-1', email: 'op@tamago.farm', role: 'superadmin', isActive: 1 },
            ])
          }
          return Promise.resolve([])
        },
      }),
    } as any)

    const res = await listFirebaseUsers()
    expect(res.users.length).toBe(2)

    const op = res.users.find(u => u.uid === 'op-1')
    expect(op?.isAdmin).toBe(true)
    expect(op?.adminRole).toBe('superadmin')
    expect(op?.adminActive).toBe(true)

    const cust = res.users.find(u => u.uid === 'cust-1')
    expect(cust?.isAdmin).toBe(false)
    expect(cust?.adminRole).toBeNull()
    expect(cust?.adminActive).toBeNull()
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
    vi.spyOn(tursoDb, 'ensureControlDbBootstrapped').mockResolvedValue(undefined)
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

describe('Admin Migrations Turso Cloud Compatibility and Schema Meta', () => {
  const tenants = [
    {
      id: 'tenant-cloud-1',
      name: 'Cloud Pastures',
      dbUrl: 'libsql://cloud-pastures.turso.io',
      dbAuthToken: 'token_secret_never_leak',
    },
  ]

  beforeEach(() => {
    vi.spyOn(tursoDb, 'ensureControlDbBootstrapped').mockResolvedValue(undefined)
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(tenants),
        }),
      }),
    } as any)
    vi.spyOn(adminAudit, 'recordAdminAuditLog').mockResolvedValue({} as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports up_to_date for Turso Cloud tenants via readTenantSchemaVersion even if PRAGMA user_version is 0', async () => {
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: () => Promise.resolve(tenants),
      }),
    } as any)
    vi.spyOn(tursoDb, 'getTenantLibsqlClient').mockReturnValue({} as any)
    vi.spyOn(tursoDb, 'readTenantSchemaVersion').mockResolvedValue(3)

    const status = await getFleetMigrationStatus()
    expect(status.fleetSummary.total).toBe(1)
    expect(status.fleetSummary.upToDate).toBe(1)
    expect(status.fleetSummary.pending).toBe(0)
    expect(status.tenants[0]?.status).toBe('up_to_date')
    expect(status.tenants[0]?.currentVersion).toBe('v3')
  })

  it('runSingleTenantMigration bootstraps control DB and sanitizes errors without leaking credentials', async () => {
    const bootstrapSpy = vi.spyOn(tursoDb, 'ensureControlDbBootstrapped').mockResolvedValue(undefined)
    vi.spyOn(tursoDb, 'getTenantLibsqlClient').mockReturnValue({} as any)
    vi.spyOn(tursoDb, 'initTenantDbSchema').mockRejectedValue(
      new Error('Failed connecting to https://secret_token@turso.io/db: connection refused'),
    )

    const res = await runSingleTenantMigration('tenant-cloud-1', 'admin@tamago.farm')
    expect(bootstrapSpy).toHaveBeenCalled()
    expect(res.success).toBe(false)
    expect(res.error).toBeDefined()
    expect(res.error).toContain('[redacted-url]')
    expect(res.error).not.toContain('secret_token')
  })

  it('runSingleTenantMigration returns success and records audit log on completion', async () => {
    const bootstrapSpy = vi.spyOn(tursoDb, 'ensureControlDbBootstrapped').mockResolvedValue(undefined)
    const auditSpy = vi.spyOn(adminAudit, 'recordAdminAuditLog').mockResolvedValue({} as any)
    vi.spyOn(tursoDb, 'getTenantLibsqlClient').mockReturnValue({} as any)
    vi.spyOn(tursoDb, 'initTenantDbSchema').mockResolvedValue(undefined)

    const res = await runSingleTenantMigration('tenant-cloud-1', 'admin@tamago.farm')
    expect(bootstrapSpy).toHaveBeenCalled()
    expect(res.success).toBe(true)
    expect(res.version).toBe('v3')
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'schema_migration',
      targetId: 'tenant-cloud-1',
    }))
  })

  it('runBatchMigrations bootstraps control DB before querying tenants', async () => {
    const bootstrapSpy = vi.spyOn(tursoDb, 'ensureControlDbBootstrapped').mockResolvedValue(undefined)
    vi.spyOn(tursoDb, 'getControlDb').mockReturnValue({
      select: () => ({
        from: () => Promise.resolve(tenants),
      }),
    } as any)
    vi.spyOn(tursoDb, 'getTenantLibsqlClient').mockReturnValue({} as any)
    vi.spyOn(tursoDb, 'initTenantDbSchema').mockResolvedValue(undefined)

    const res = await runBatchMigrations(['tenant-cloud-1'], 'admin@tamago.farm')
    expect(bootstrapSpy).toHaveBeenCalled()
    expect(res.successful).toBe(1)
  })
})
