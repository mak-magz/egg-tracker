/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, rmSync } from 'node:fs'
import { createClient, type Client as LibSqlClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDrizzleBackedClient } from '../../server/db/adapter'
import * as tenantSchema from '../../server/db/schema/tenant'
import { initTenantDbSchema, migrateTenantDatabase, readTenantSchemaVersion, TENANT_SCHEMA_USER_VERSION } from '../../server/db/turso'
import { applyFarmSnapshot, applySyncPush, exportTenantSnapshot, pullSyncChanges } from '../../server/repositories/sync'
import { createTenantDbFromClient, type TenantClient, type TenantDb } from '../../server/utils/db'

const DB_FILE = 'local-tenant-test-sync-backend.db'

describe('Backend Sync Canonical CDC, Rejections & Migrations', () => {
  let client: LibSqlClient
  let drizzleDb: any
  let tenantDb: TenantDb

  const tenantMeta = {
    tenantId: 'test-sync-backend',
    name: 'Test Backend Farm',
    eggsPerTray: 30,
    currency: 'PHP',
    deviceId: 'D1',
  }

  beforeAll(async () => {
    for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
      if (existsSync(f)) rmSync(f, { force: true })
    }
    client = createClient({ url: `file:${DB_FILE}` })
    await initTenantDbSchema(client)
    drizzleDb = drizzle(client, { schema: tenantSchema })
    const drizzleClient = createDrizzleBackedClient(drizzleDb, tenantMeta) as unknown as TenantClient
    tenantDb = createTenantDbFromClient(drizzleClient, tenantMeta.tenantId)
  })

  afterAll(() => {
    if (client) client.close()
    for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
      if (existsSync(f)) {
        try {
          rmSync(f, { force: true })
        }
        catch {
          // ignore Windows file lock
        }
      }
    }
  })

  it('migrates tenant schema idempotently to PRAGMA user_version = 3', async () => {
    await client.execute('PRAGMA user_version = 0;')
    await migrateTenantDatabase(client)
    const rs = await client.execute('PRAGMA user_version;')
    expect(Number(rs.rows[0]?.user_version)).toBe(TENANT_SCHEMA_USER_VERSION)

    const rejCheck = await client.execute(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_rejections'`)
    expect(rejCheck.rows).toHaveLength(1)
  })

  it('preserves size defaultPrice through snapshot import and export', async () => {
    const snapRes = await applyFarmSnapshot(tenantDb, {
      deviceId: 'D1',
      farmSettings: { name: 'Priced Farm', eggsPerTray: 30, currency: 'PHP' },
      sizes: [
        { id: 'sz-s', name: 'Small', sortOrder: 0, colorSlot: 0, defaultPrice: 185.5, archivedAt: null },
        { id: 'sz-m', name: 'Medium', sortOrder: 1, colorSlot: 1, defaultPrice: null, archivedAt: null },
      ],
      clients: [
        { id: 'cl-secret', name: 'Maria Santos Private', phone: '+639171234567', defaultPrice: 210, archivedAt: null, version: 1 },
      ],
    })
    expect(snapRes.success).toBe(true)

    const exported = await exportTenantSnapshot(tenantDb)
    const small = exported.snapshot.sizes.find(s => s.id === 'sz-s')
    expect(small?.defaultPrice).toBe(185.5)
  })

  it('emits canonical op change_log payloads with correct action values and no self-drop regression', async () => {
    await applySyncPush(tenantDb, {
      deviceId: 'D1',
      mutations: [
        {
          id: 'mut-prod-1',
          type: 'log_production',
          occurredAt: '2026-11-10T07:00:00.000Z',
          payload: {
            submissionId: 'sub-prod-1',
            date: '2026-11-10',
            good: [{ sizeId: 'sz-s', eggs: 60 }],
            rejects: 2,
          },
        },
        {
          id: 'mut-order-1',
          type: 'create_order',
          occurredAt: '2026-11-10T08:00:00.000Z',
          payload: {
            id: 'ord-1',
            submissionId: 'sub-ord-1',
            clientId: 'cl-secret',
            orderDate: '2026-11-10',
            orderNumber: 'D1-0001',
            lines: [{ sizeId: 'sz-s', eggs: 30, pricePerTray: 190 }],
          },
        },
        {
          id: 'mut-deliv-1',
          type: 'deliver_order',
          occurredAt: '2026-11-10T09:00:00.000Z',
          payload: {
            id: 'ord-1',
            saleId: 'sale-deliv-1',
            saleNumber: 'D1-0001',
            submissionId: 'sub-deliv-1',
            deliveredDate: '2026-11-10',
            lines: [{ sizeId: 'sz-s', eggs: 30 }],
          },
        },
      ],
    })

    const pullRes = await pullSyncChanges(tenantDb, 0, 50, 'D2')
    const prodChange = pullRes.changes.find(c => c.entityType === 'production')
    expect(prodChange?.action).toBe('insert')
    expect(prodChange?.data.op).toBe('log_production')
    expect(prodChange?.data.good).toEqual([{ sizeId: 'sz-s', eggs: 60 }])
    expect(prodChange?.data.rejects).toBe(2)

    const delivChange = pullRes.changes.filter(c => c.entityType === 'orders').at(-1)
    expect(delivChange?.action).toBe('update')
    expect(delivChange?.data.op).toBe('deliver_order')
    expect(delivChange?.data.sale?.id).toBe('sale-deliv-1')
    expect(delivChange?.data.sale?.saleNumber).toBe('D1-0001')
  })

  it('persists sanitized non-PII sync_rejections on error and resolves them on applied retry', async () => {
    const failPush = await applySyncPush(tenantDb, {
      deviceId: 'D1',
      mutations: [
        {
          id: 'mut-bad-deliver',
          type: 'deliver_order',
          occurredAt: '2026-11-10T10:00:00.000Z',
          payload: {
            id: 'ord-1',
            saleId: 'sale-bad-1',
            submissionId: 'sub-bad-1',
            deliveredDate: '2026-11-10',
            lines: [{ sizeId: 'sz-s', eggs: 99 }],
          },
        },
      ],
    })

    expect(failPush.results[0]?.status).toBe('rejected')

    const rejections = await drizzleDb
      .select()
      .from(tenantSchema.syncRejections)
      .where(eq(tenantSchema.syncRejections.mutationId, 'mut-bad-deliver'))

    expect(rejections).toHaveLength(1)
    expect(rejections[0].mutationType).toBe('deliver_order')
    expect(rejections[0].entityRef).toBe('order:ord-1')
    expect(rejections[0].resolvedAt).toBeNull()
    expect(JSON.stringify(rejections[0])).not.toContain('Maria Santos')
    expect(JSON.stringify(rejections[0])).not.toContain('+639171234567')

    // Now retry the same mutation ID with a valid op (e.g., logging production instead of invalid over-delivery)
    // to verify applied mutationId marks prior sync_rejections resolved
    const retryPush = await applySyncPush(tenantDb, {
      deviceId: 'D1',
      mutations: [
        {
          id: 'mut-bad-deliver',
          type: 'log_production',
          occurredAt: '2026-11-10T11:00:00.000Z',
          payload: {
            submissionId: 'sub-retry-ok',
            date: '2026-11-10',
            good: [{ sizeId: 'sz-m', eggs: 30 }],
            rejects: 0,
          },
        },
      ],
    })

    expect(retryPush.results[0]?.status).toBe('applied')
    const afterRetry = await drizzleDb
      .select()
      .from(tenantSchema.syncRejections)
      .where(eq(tenantSchema.syncRejections.mutationId, 'mut-bad-deliver'))
    expect(afterRetry[0].resolvedAt).not.toBeNull()
  })

  it('tracks schema version in _schema_meta and succeeds when PRAGMA user_version writes are blocked (Turso Cloud)', async () => {
    const metaCheck = await client.execute('SELECT version FROM _schema_meta WHERE id = 1')
    expect(Number(metaCheck.rows[0]?.version)).toBe(TENANT_SCHEMA_USER_VERSION)

    const version = await readTenantSchemaVersion(client)
    expect(version).toBe(TENANT_SCHEMA_USER_VERSION)

    const restrictedClient: LibSqlClient = {
      ...client,
      execute: vi.fn(async (stmt: any) => {
        const sql = typeof stmt === 'string' ? stmt : stmt.sql
        if (/PRAGMA\s+user_version\s*=/i.test(sql)) {
          throw new Error('SQLite error: not authorized')
        }
        return client.execute(stmt)
      }),
      batch: vi.fn(async (stmts: any[], mode?: any) => client.batch(stmts, mode)),
    } as unknown as LibSqlClient

    await expect(migrateTenantDatabase(restrictedClient)).resolves.not.toThrow()
    expect(await readTenantSchemaVersion(restrictedClient)).toBe(TENANT_SCHEMA_USER_VERSION)
  })

  it('completes initial v0 -> v3 migration when PRAGMA user_version writes throw not authorized', async () => {
    const cloudTestFile = 'local-tenant-test-turso-cloud-sim.db'
    for (const f of [cloudTestFile, `${cloudTestFile}-wal`, `${cloudTestFile}-shm`]) {
      if (existsSync(f)) rmSync(f, { force: true })
    }
    const rawCloudClient = createClient({ url: `file:${cloudTestFile}` })
    const cloudClient: LibSqlClient = {
      ...rawCloudClient,
      execute: vi.fn(async (stmt: any) => {
        const sql = typeof stmt === 'string' ? stmt : stmt.sql
        if (/PRAGMA\s+user_version\s*=/i.test(sql)) {
          throw new Error('SQLite error: not authorized')
        }
        return rawCloudClient.execute(stmt)
      }),
      batch: vi.fn(async (stmts: any[], mode?: any) => rawCloudClient.batch(stmts, mode)),
      close: () => rawCloudClient.close(),
    } as unknown as LibSqlClient

    try {
      await expect(migrateTenantDatabase(cloudClient)).resolves.not.toThrow()
      expect(await readTenantSchemaVersion(cloudClient)).toBe(TENANT_SCHEMA_USER_VERSION)

      const meta = await cloudClient.execute('SELECT version FROM _schema_meta WHERE id = 1')
      expect(Number(meta.rows[0]?.version)).toBe(TENANT_SCHEMA_USER_VERSION)

      const tables = await cloudClient.execute(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_rejections'`)
      expect(tables.rows).toHaveLength(1)
    }
    finally {
      cloudClient.close()
      for (const f of [cloudTestFile, `${cloudTestFile}-wal`, `${cloudTestFile}-shm`]) {
        if (existsSync(f)) {
          try {
            rmSync(f, { force: true })
          }
          catch {
            // ignore Windows file lock
          }
        }
      }
    }
  })
})
