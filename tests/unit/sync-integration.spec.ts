/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@libsql/client'
import type { Client as LibSqlClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { initTenantDbSchema } from '../../server/db/turso'
import * as tenantSchema from '../../server/db/schema/tenant'
import { createDrizzleBackedClient } from '../../server/db/adapter'
import { createTenantDbFromClient } from '../../server/utils/db'
import type { TenantClient, TenantDb } from '../../server/utils/db'
import { applyFarmSnapshot, applySyncPush, exportTenantSnapshot, pullSyncChanges } from '../../server/repositories/sync'

const DB_FILE = 'local-tenant-test-sync.db'
const DB_URL = `file:${DB_FILE}`

describe('Tier 2: Real Local LibSQL Sync Integration', () => {
  let client: LibSqlClient
  let drizzleDb: any
  let tenantDb: TenantDb

  const tenantMeta = {
    tenantId: 'test-farm',
    name: 'Test Farm',
    eggsPerTray: 30,
    currency: 'PHP',
    deviceId: 'D1',
  }

  beforeAll(async () => {
    // Clean up any stale test database
    for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
      if (existsSync(f)) rmSync(f, { force: true })
    }

    // 1. Initialization: Create @libsql/client and bootstrap schema
    client = createClient({ url: DB_URL })
    await initTenantDbSchema(client)

    // 2. Instantiate TenantDb
    drizzleDb = drizzle(client, { schema: tenantSchema })
    const drizzleClient = createDrizzleBackedClient(drizzleDb, tenantMeta) as unknown as TenantClient
    tenantDb = createTenantDbFromClient(drizzleClient, tenantMeta.tenantId)
  })

  afterAll(async () => {
    // 7. Cleanup: Close client, remove test-sync-tenant.db file
    if (client) {
      client.close()
    }
    for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
      if (existsSync(f)) {
        try {
          rmSync(f, { force: true })
        }
        catch {
          // Ignore Windows file lock cleanup issues if delayed
        }
      }
    }
  })

  it('1 & 2. initializes schema and boots TenantDb successfully', async () => {
    expect(tenantDb).toBeDefined()
    expect(tenantDb.tenantId).toBe('test-farm')

    // Verify default sizes were seeded by initTenantDbSchema
    const sizes = await drizzleDb.select().from(tenantSchema.sizes)
    expect(sizes.length).toBeGreaterThanOrEqual(3)
  })

  it('3. applies farm snapshot and initializes change_log and sync_state baseline', async () => {
    const snapshotPayload = {
      deviceId: 'D1',
      farmSettings: {
        name: 'Test Farm',
        eggsPerTray: 30,
        currency: 'PHP',
      },
      sizes: [
        { id: 'size-small', name: 'Small', sortOrder: 0, colorSlot: 0, archivedAt: null },
        { id: 'size-medium', name: 'Medium', sortOrder: 1, colorSlot: 1, archivedAt: null },
        { id: 'size-large', name: 'Large', sortOrder: 2, colorSlot: 2, archivedAt: null },
      ],
      clients: [
        { id: 'client-a', name: 'Client A', phone: '09170000001', defaultPrice: 200, archivedAt: null, version: 1 },
      ],
      production: [
        { id: 'prod-init-1', producedOn: '2026-11-05', sizeId: 'size-small', quality: 'good' as const, eggs: 120 },
        { id: 'prod-init-2', producedOn: '2026-11-05', sizeId: null, quality: 'reject' as const, eggs: 4 },
      ],
      sales: [
        {
          id: 'sale-init-1',
          saleNumber: 'D1-0001',
          clientId: 'client-a',
          type: 'delivery' as const,
          saleDate: '2026-11-05',
          version: 1,
          voidedAt: null,
        },
      ],
      saleLines: [
        { saleId: 'sale-init-1', sizeId: 'size-small', eggs: 60, pricePerTray: 200, lineTotal: 400 },
      ],
    }

    const res = await applyFarmSnapshot(tenantDb, snapshotPayload)
    expect(res.success).toBe(true)
    expect(res.baseVersion).toBe(1)
    expect(res.appliedAt).toBeDefined()

    // Verify snapshot baseline recorded in change_log
    const logs = await drizzleDb.select().from(tenantSchema.changeLog).where(eq(tenantSchema.changeLog.version, 1))
    expect(logs.length).toBe(1)
    expect(logs[0].entityType).toBe('snapshot')
    expect(logs[0].deviceId).toBe('D1')

    // Verify sync_state tracking
    const syncStateRows = await drizzleDb.select().from(tenantSchema.syncState)
    expect(syncStateRows.length).toBe(1)
    expect(syncStateRows[0].lastPulledVersion).toBe(1)

    // Verify sizes and clients were inserted
    const clients = await drizzleDb.select().from(tenantSchema.clients).where(eq(tenantSchema.clients.id, 'client-a'))
    expect(clients.length).toBe(1)
    expect(clients[0].name).toBe('Client A')

    const prods = await drizzleDb.select().from(tenantSchema.production).where(eq(tenantSchema.production.producedOn, '2026-11-05'))
    expect(prods.length).toBe(2)
  })

  it('4. applies sync push mutations from Device 1 and appends to change_log', async () => {
    const mutations = [
      {
        id: 'mut-sale-1',
        type: 'create_sale',
        occurredAt: '2026-11-06T10:00:00.000Z',
        payload: {
          id: 'sale-d1-1',
          submissionId: 'sub-sale-d1-1',
          saleNumber: 'D1-0002',
          type: 'on_site',
          saleDate: '2026-11-06',
          clientId: null,
          lines: [
            { sizeId: 'size-small', eggs: 30, pricePerTray: 200 },
          ],
        },
      },
      {
        id: 'mut-prod-1',
        type: 'log_production',
        occurredAt: '2026-11-06T10:05:00.000Z',
        payload: {
          submissionId: 'sub-prod-d1-1',
          date: '2026-11-06',
          good: [
            { sizeId: 'size-small', eggs: 90 },
          ],
          rejects: 5,
        },
      },
      {
        id: 'mut-cli-1',
        type: 'add_client',
        occurredAt: '2026-11-06T10:10:00.000Z',
        payload: {
          id: 'cli-d1-1',
          submissionId: 'sub-cli-d1-1',
          name: 'New Local Client',
          phone: '09178888888',
          defaultPrice: 220,
        },
      },
    ]

    const pushResult = await applySyncPush(tenantDb, {
      deviceId: 'D1',
      mutations,
    })

    expect(pushResult.results).toHaveLength(3)
    for (const r of pushResult.results) {
      expect(r.status).toBe('applied')
    }
    expect(pushResult.latestVersion).toBe(4) // baseline version 1 + 3 mutations

    // Verify mutations are in change_log
    const changeLogs = await drizzleDb.select().from(tenantSchema.changeLog)
    expect(changeLogs.length).toBe(4)

    // Verify client was added in DB
    const [newClient] = await drizzleDb.select().from(tenantSchema.clients).where(eq(tenantSchema.clients.id, 'cli-d1-1'))
    expect(newClient).toBeDefined()
    expect(newClient.name).toBe('New Local Client')

    // Verify sale was created in DB
    const [newSale] = await drizzleDb.select().from(tenantSchema.sales).where(eq(tenantSchema.sales.id, 'sale-d1-1'))
    expect(newSale).toBeDefined()
    expect(newSale.saleNumber).toBe('D1-0002')
  })

  it('5. excludes Device 1 echo when Device 1 pulls changes', async () => {
    const pullD1 = await pullSyncChanges(tenantDb, {
      sinceVersion: 1,
      limit: 50,
      excludeDeviceId: 'D1',
    })

    expect(pullD1.changes).toHaveLength(0)
    expect(pullD1.latestVersion).toBe(4)
    expect(pullD1.hasMore).toBe(false)
  })

  it('5. delivers Device 1 mutations to Device 2 when Device 2 pulls changes', async () => {
    const pullD2 = await pullSyncChanges(tenantDb, {
      sinceVersion: 1,
      limit: 50,
      excludeDeviceId: 'D2',
    })

    expect(pullD2.changes).toHaveLength(3)
    expect(pullD2.latestVersion).toBe(4)

    const [saleChange, prodChange, clientChange] = pullD2.changes
    expect(saleChange.entityType).toBe('create_sale')
    expect(saleChange.deviceId).toBe('D1')
    expect(saleChange.data.saleNumber).toBe('D1-0002')

    expect(prodChange.entityType).toBe('log_production')
    expect(prodChange.deviceId).toBe('D1')
    expect(prodChange.data.rejects).toBe(5)

    expect(clientChange.entityType).toBe('add_client')
    expect(clientChange.deviceId).toBe('D1')
    expect(clientChange.data.name).toBe('New Local Client')
  })

  it('6. resolves conflicts using Last-Write-Wins (LWW)', async () => {
    const [currentClient] = await drizzleDb.select().from(tenantSchema.clients).where(eq(tenantSchema.clients.id, 'cli-d1-1'))
    expect(currentClient).toBeDefined()

    // 1. Stale intent edit: occurredAt is older than client.updatedAt
    const olderOccurredAt = '2020-01-01T00:00:00.000Z'
    const staleMutation = {
      id: 'mut-stale-cli',
      type: 'update_client',
      occurredAt: olderOccurredAt,
      payload: {
        id: 'cli-d1-1',
        name: 'Stale Client Name',
        phone: '09170000000',
        defaultPrice: 150,
        version: currentClient.version,
      },
    }

    const stalePush = await applySyncPush(tenantDb, {
      deviceId: 'D2',
      mutations: [staleMutation],
    })

    expect(stalePush.results).toHaveLength(1)
    expect(stalePush.results[0].id).toBe('mut-stale-cli')
    expect(stalePush.results[0].status).toBe('conflict_lww')

    // Verify client name was NOT updated
    const [clientAfterStale] = await drizzleDb.select().from(tenantSchema.clients).where(eq(tenantSchema.clients.id, 'cli-d1-1'))
    expect(clientAfterStale.name).toBe('New Local Client')

    // 2. Fresh intent edit: occurredAt is newer than client.updatedAt
    const newerOccurredAt = new Date(Date.now() + 60_000).toISOString()
    const freshMutation = {
      id: 'mut-fresh-cli',
      type: 'update_client',
      occurredAt: newerOccurredAt,
      payload: {
        id: 'cli-d1-1',
        name: 'Updated Fresh Client Name',
        phone: '09179999999',
        defaultPrice: 250,
        version: currentClient.version,
      },
    }

    const freshPush = await applySyncPush(tenantDb, {
      deviceId: 'D2',
      mutations: [freshMutation],
    })

    expect(freshPush.results).toHaveLength(1)
    expect(freshPush.results[0].id).toBe('mut-fresh-cli')
    expect(freshPush.results[0].status).toBe('applied')

    // Verify client name WAS updated
    const [clientAfterFresh] = await drizzleDb.select().from(tenantSchema.clients).where(eq(tenantSchema.clients.id, 'cli-d1-1'))
    expect(clientAfterFresh.name).toBe('Updated Fresh Client Name')
    expect(clientAfterFresh.defaultPrice).toBe(250)
  })

  it('7. prevents production duplication when snapshot includes productionSubmissions and a racing push replays the same submissionId', async () => {
    // Simulate Browser 1 logging 1 tray (30 eggs) with submissionId 'sub-race-tray1' and uploading snapshot
    const snapshotWithSubmission = {
      deviceId: 'D1',
      farmSettings: {
        name: 'Test Farm',
        eggsPerTray: 30,
        currency: 'PHP',
      },
      sizes: [
        { id: 'size-small', name: 'Small', sortOrder: 0, colorSlot: 0, archivedAt: null },
        { id: 'size-medium', name: 'Medium', sortOrder: 1, colorSlot: 1, archivedAt: null },
        { id: 'size-large', name: 'Large', sortOrder: 2, colorSlot: 2, archivedAt: null },
      ],
      production: [
        { id: 'prod-row-1', producedOn: '2026-11-12', sizeId: 'size-large', quality: 'good' as const, eggs: 30 },
      ],
      productionSubmissions: [
        { id: 'sub-race-tray1', producedOn: '2026-11-12', hadBefore: false },
      ],
    }

    const snapRes = await applyFarmSnapshot(tenantDb, snapshotWithSubmission)
    expect(snapRes.success).toBe(true)

    // Verify production has exactly 30 eggs (1 tray)
    const prodBefore = await drizzleDb.select().from(tenantSchema.production).where(eq(tenantSchema.production.producedOn, '2026-11-12'))
    expect(prodBefore).toHaveLength(1)
    expect(prodBefore[0].eggs).toBe(30)

    // Verify change_log was reset to only the snapshot baseline entry
    const logsAfterSnap = await drizzleDb.select().from(tenantSchema.changeLog)
    expect(logsAfterSnap).toHaveLength(1)
    expect(logsAfterSnap[0].entityType).toBe('snapshot')

    // Now simulate a racing sync_push replaying the exact same log_production mutation ('sub-race-tray1')
    const pushRes = await applySyncPush(tenantDb, {
      deviceId: 'D1',
      mutations: [
        {
          id: 'mut-race-1',
          type: 'log_production',
          occurredAt: '2026-11-12T08:00:00.000Z',
          payload: {
            submissionId: 'sub-race-tray1',
            date: '2026-11-12',
            good: [{ sizeId: 'size-large', eggs: 30 }],
            rejects: 0,
          },
        },
      ],
    })

    expect(pushRes.results).toHaveLength(1)
    expect(pushRes.results[0].status).toBe('applied')

    // CRITICAL INVARIANT: Production must still be 30 eggs (1 tray), NEVER 60 eggs (2 trays)!
    const prodAfter = await drizzleDb.select().from(tenantSchema.production).where(eq(tenantSchema.production.producedOn, '2026-11-12'))
    expect(prodAfter).toHaveLength(1)
    expect(prodAfter[0].eggs).toBe(30)

    // Verify exportTenantSnapshot includes productionSubmissions for Browser 2 login hydration
    const exported = await exportTenantSnapshot(tenantDb)
    expect(exported.snapshot.productionSubmissions).toEqual([
      { id: 'sub-race-tray1', producedOn: '2026-11-12', hadBefore: false },
    ])
  })
})
