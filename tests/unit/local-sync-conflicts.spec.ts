/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, rmSync } from 'node:fs'
import { createClient, type Client as LibSqlClient } from '@libsql/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  applyRemoteChangesOps,
  classifyOutboxError,
  formatFailedMutation,
  LOCAL_SCHEMA_USER_VERSION,
  type LocalSqlDriver,
  migrateLocalSchema,
  summarizeLocalData,
} from '../../app/local/sync-helpers'
import { SyncEngine } from '../../app/local/sync'

const DB_FILE = 'local-test-worker-helpers.db'

const BASE_TABLES = [
  `CREATE TABLE IF NOT EXISTS farm_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    farm_name TEXT NOT NULL DEFAULT 'My Farm',
    eggs_per_tray INTEGER NOT NULL DEFAULT 30,
    currency TEXT NOT NULL DEFAULT 'PHP',
    device_id TEXT NOT NULL DEFAULT 'D1',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS local_counters (
    id TEXT PRIMARY KEY,
    next_number INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sizes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    color_slot INTEGER NOT NULL UNIQUE,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    default_price REAL,
    archived_at TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS production (
    id TEXT PRIMARY KEY,
    produced_on TEXT NOT NULL,
    size_id TEXT,
    quality TEXT NOT NULL,
    eggs INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL,
    order_date TEXT NOT NULL,
    wanted_by TEXT,
    status TEXT NOT NULL DEFAULT 'requested',
    cancelled_at TEXT,
    closed_short_at TEXT,
    converted_from_sale_number TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS order_lines (
    order_id TEXT NOT NULL,
    size_id TEXT NOT NULL,
    eggs INTEGER NOT NULL,
    price_per_tray REAL NOT NULL,
    line_total REAL NOT NULL,
    dropped_eggs INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (order_id, size_id)
  );`,
  `CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    sale_number TEXT NOT NULL UNIQUE,
    client_id TEXT,
    type TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    order_id TEXT,
    order_number TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    voided_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sale_lines (
    sale_id TEXT NOT NULL,
    size_id TEXT NOT NULL,
    eggs INTEGER NOT NULL,
    price_per_tray REAL NOT NULL,
    line_total REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (sale_id, size_id)
  );`,
  `CREATE TABLE IF NOT EXISTS outbox_mutations (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    mutation_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sync_state (
    id TEXT PRIMARY KEY DEFAULT 'default',
    tenant_id TEXT,
    cloud_url TEXT,
    cloud_token TEXT,
    last_pulled_version INTEGER NOT NULL DEFAULT 0,
    last_pulled_at TEXT,
    last_pushed_at TEXT,
    status TEXT NOT NULL DEFAULT 'local_only',
    last_error TEXT,
    updated_at TEXT NOT NULL
  );`,
]

describe('Local Worker Sync Helpers & SyncEngine', () => {
  let client: LibSqlClient
  let driver: LocalSqlDriver

  beforeAll(async () => {
    for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
      if (existsSync(f)) rmSync(f, { force: true })
    }
    client = createClient({ url: `file:${DB_FILE}` })
    for (const ddl of BASE_TABLES) {
      await client.execute(ddl)
    }
    const now = new Date().toISOString()
    await client.execute({
      sql: `INSERT INTO farm_settings (id, farm_name, eggs_per_tray, currency, device_id, created_at, updated_at) VALUES ('default', 'Local Farm', 30, 'PHP', 'D2', ?, ?)`,
      args: [now, now],
    })
    await client.execute({
      sql: `INSERT INTO local_counters (id, next_number, updated_at) VALUES ('sales', 1, ?), ('orders', 1, ?)`,
      args: [now, now],
    })
    await client.execute({
      sql: `INSERT INTO sync_state (id, status, updated_at) VALUES ('default', 'local_only', ?)`,
      args: [now],
    })
    await client.execute({
      sql: `INSERT INTO sizes (id, name, sort_order, color_slot, created_at, updated_at) VALUES
            ('s1', 'Small', 0, 0, ?, ?),
            ('s2', 'Medium', 1, 1, ?, ?),
            ('s3', 'Large', 2, 2, ?, ?),
            ('s4', 'Jumbo', 3, 3, ?, ?)`,
      args: [now, now, now, now, now, now, now, now],
    })

    driver = {
      exec: async (sql, bind) => {
        await client.execute({ sql, args: bind ?? [] })
      },
      query: async <T = Record<string, any>>(sql: string, bind?: any[]) => {
        const res = await client.execute({ sql, args: bind ?? [] })
        return res.rows as unknown as T[]
      },
    }
  })

  afterAll(() => {
    if (client) client.close()
    for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
      if (existsSync(f)) {
        try {
          rmSync(f, { force: true })
        }
        catch {
          // ignore lock
        }
      }
    }
  })

  it('migrates local schema cleanly via PRAGMA user_version to v3', async () => {
    const version = await migrateLocalSchema(driver)
    expect(version).toBe(LOCAL_SCHEMA_USER_VERSION)
    const rows = await driver.query<{ user_version: number }>('PRAGMA user_version;')
    expect(Number(rows[0]?.user_version)).toBe(3)
  })

  it('reports hasData = false on pristine default DB and true when data/outbox exists', async () => {
    const cleanSummary = await summarizeLocalData(driver)
    expect(cleanSummary.hasData).toBe(false)

    await driver.exec(
      `INSERT INTO outbox_mutations (id, device_id, mutation_type, payload, occurred_at, status, error, created_at)
       VALUES ('out-1', 'D2', 'deliver_order', '{"orderNumber":"D2-0001"}', '2026-11-11T10:00:00Z', 'failed', 'over delivery', '2026-11-11T10:00:00Z')`,
    )
    const dirtySummary = await summarizeLocalData(driver)
    expect(dirtySummary.hasData).toBe(true)
    expect(dirtySummary.failedOutboxCount).toBe(1)

    const formatted = formatFailedMutation({
      id: 'out-1',
      device_id: 'D2',
      mutation_type: 'deliver_order',
      payload: '{"orderNumber":"D2-0001"}',
      occurred_at: '2026-11-11T10:00:00Z',
      status: 'failed',
      error: 'over delivery',
      created_at: '2026-11-11T10:00:00Z',
    }, 1)
    expect(formatted.errorCode).toBe('over_delivered')
    expect(formatted.entityLabel).toContain('#D2-0001')
  })

  it('applies remote canonical changes idempotently without double-counting log_production and advances counters', async () => {
    const changes: any[] = [
      {
        version: 1,
        entityType: 'farm_settings',
        entityId: 'default',
        action: 'update',
        deviceId: 'D1',
        occurredAt: '2026-11-11T08:00:00Z',
        data: { op: 'update_farm_settings', name: 'Sunrise Cloud', eggsPerTray: 36, currency: 'USD', onboardingCompleted: true },
      },
      {
        version: 2,
        entityType: 'sizes',
        entityId: 'reorder',
        action: 'update',
        deviceId: 'D1',
        occurredAt: '2026-11-11T08:01:00Z',
        data: { op: 'reorder_sizes', orders: [{ id: 's2', sortOrder: 0 }, { id: 's1', sortOrder: 1 }] },
      },
      {
        version: 3,
        entityType: 'production',
        entityId: '2026-11-11',
        action: 'insert',
        deviceId: 'D1',
        occurredAt: '2026-11-11T08:02:00Z',
        data: { op: 'log_production', date: '2026-11-11', good: [{ sizeId: 's1', eggs: 90 }], rejects: 3 },
      },
      {
        version: 4,
        entityType: 'clients',
        entityId: 'c1',
        action: 'insert',
        deviceId: 'D1',
        occurredAt: '2026-11-11T08:03:00Z',
        data: { op: 'add_client', id: 'c1', name: 'Bakery Co', phone: null, defaultPrice: 200, version: 1 },
      },
      {
        version: 5,
        entityType: 'orders',
        entityId: 'o1',
        action: 'insert',
        deviceId: 'D1',
        occurredAt: '2026-11-11T08:04:00Z',
        data: {
          op: 'create_order',
          id: 'o1',
          orderNumber: 'D1-0005',
          clientId: 'c1',
          orderDate: '2026-11-11',
          status: 'confirmed',
          lines: [{ sizeId: 's1', orderedEggs: 60, pricePerTray: 200, lineTotal: 400, droppedEggs: 0 }],
        },
      },
      {
        version: 6,
        entityType: 'orders',
        entityId: 'o1',
        action: 'update',
        deviceId: 'D1',
        occurredAt: '2026-11-11T08:05:00Z',
        data: {
          op: 'deliver_order',
          id: 'o1',
          orderNumber: 'D1-0005',
          clientId: 'c1',
          orderDate: '2026-11-11',
          status: 'fulfilled',
          lines: [{ sizeId: 's1', orderedEggs: 60, pricePerTray: 200, lineTotal: 400, droppedEggs: 0 }],
          sale: {
            id: 'sale-1',
            saleNumber: 'D1-0007',
            clientId: 'c1',
            type: 'delivery',
            saleDate: '2026-11-11',
            orderId: 'o1',
            orderNumber: 'D1-0005',
            lines: [{ sizeId: 's1', eggs: 60, pricePerTray: 200, lineTotal: 400 }],
          },
        },
      },
    ]

    await applyRemoteChangesOps(driver, changes, 6)
    // Replay the exact same batch again to verify 100% idempotency!
    await applyRemoteChangesOps(driver, changes, 6)

    const prod = await driver.query<{ eggs: number, quality: string }>(`SELECT eggs, quality FROM production WHERE produced_on = '2026-11-11'`)
    const goodSum = prod.filter(r => r.quality === 'good').reduce((a, b) => a + Number(b.eggs), 0)
    const rejSum = prod.filter(r => r.quality === 'reject').reduce((a, b) => a + Number(b.eggs), 0)
    expect(goodSum).toBe(90)
    expect(rejSum).toBe(3)

    const oLines = await driver.query<{ eggs: number }>(`SELECT eggs FROM order_lines WHERE order_id = 'o1'`)
    expect(oLines[0]?.eggs).toBe(60)

    const counters = await driver.query<{ id: string, next_number: number }>(`SELECT id, next_number FROM local_counters`)
    expect(counters.find(c => c.id === 'orders')?.next_number).toBe(6)
    expect(counters.find(c => c.id === 'sales')?.next_number).toBe(8)

    const syncRow = await driver.query<{ last_pulled_version: number }>(`SELECT last_pulled_version FROM sync_state WHERE id = 'default'`)
    expect(Number(syncRow[0]?.last_pulled_version)).toBe(6)
  })

  it('SyncEngine advances pull cursor when changes are empty and triggers reconcile when flagged', async () => {
    const updateSyncState = vi.fn().mockResolvedValue({ success: true })
    const reconcileFromSnapshot = vi.fn().mockResolvedValue({ success: true })
    let needsReconcile = true

    const mockWorker: any = {
      getSyncStatus: vi.fn().mockImplementation(async () => ({
        syncState: { last_pushed_at: null, needs_reconcile: needsReconcile ? 1 : 0 },
        pendingOutboxCount: 0,
        failedOutboxCount: 1,
        needsReconcile,
      })),
      getPendingMutations: vi.fn().mockResolvedValue({ mutations: [] }),
      getLastPulledVersion: vi.fn().mockResolvedValue({ lastPulledVersion: 3, lastPulledAt: null }),
      applyRemoteChanges: vi.fn(),
      updateSyncState,
      reconcileFromSnapshot: vi.fn().mockImplementation(async (snap, ver) => {
        needsReconcile = false
        return reconcileFromSnapshot(snap, ver)
      }),
      resetInFlightMutations: vi.fn(),
    }

    const fetchFn = vi.fn(async (url: string) => {
      if (url === '/api/sync/pull') {
        return { changes: [], latestVersion: 8, hasMore: false }
      }
      if (url === '/api/sync/snapshot') {
        return { snapshot: { sizes: [] }, latestVersion: 8 }
      }
      return {}
    })

    const engine = new SyncEngine({
      localWorker: mockWorker,
      getAuthToken: async () => 'test-token',
      isFree: () => false,
      syncIntervalMs: 60000,
      fetchFn,
      deviceId: 'D2',
    })

    await engine.syncCycle()
    engine.stop()

    expect(updateSyncState).toHaveBeenCalledWith(expect.objectContaining({ lastPulledVersion: 8 }))
    expect(reconcileFromSnapshot).toHaveBeenCalledWith({ sizes: [] }, 8)
    expect(engine.getState().failedCount).toBe(1)
    expect(engine.getState().lastRemoteUpdateAt).not.toBeNull()
  })

  describe('classifyOutboxError and formatFailedMutation error clarity', () => {
    it('classifies legacy server message for duplicate client without prefix', () => {
      const result = classifyOutboxError('A customer with this name already exists.')
      expect(result.errorCode).toBe('duplicate_client')
      expect(result.errorMessage).toBe('A client with this name already exists in the cloud. Two clients cannot share the same name.')
    })

    it('classifies prefixed TM020 duplicate client message', () => {
      const result = classifyOutboxError('[TM020] A client with this name already exists.')
      expect(result.errorCode).toBe('duplicate_client')
      expect(result.errorMessage).toBe('A client with this name already exists in the cloud. Two clients cannot share the same name.')
    })

    it('renders client name in formatFailedMutation detailLabel for add_client and update_client', () => {
      const addRes = formatFailedMutation({
        id: 'out-client-1',
        device_id: 'D2',
        mutation_type: 'add_client',
        payload: JSON.stringify({ name: 'Maria Santos', phone: '09171234567' }),
        occurred_at: '2026-11-14T10:00:00Z',
        status: 'failed',
        error: '[TM020] A client with this name already exists.',
        created_at: '2026-11-14T10:00:00Z',
      }, 1)

      expect(addRes.entityLabel).toBe('Add Client')
      expect(addRes.detailLabel).toBe('Maria Santos • 2026-11-14')
      expect(addRes.errorCode).toBe('duplicate_client')
      expect(addRes.errorMessage).toContain('A client with this name already exists')

      const updateRes = formatFailedMutation({
        id: 'out-client-2',
        device_id: 'D2',
        mutation_type: 'update_client',
        payload: JSON.stringify({ id: 'c1', name: 'Sunrise Bakery' }),
        occurred_at: '2026-11-14T10:00:00Z',
        status: 'failed',
        error: 'A customer with this name already exists.',
        created_at: '2026-11-14T10:00:00Z',
      }, 2)

      expect(updateRes.entityLabel).toBe('Update Client')
      expect(updateRes.detailLabel).toBe('Sunrise Bakery • 2026-11-14')
      expect(updateRes.errorCode).toBe('duplicate_client')
    })

    it('classifies TM037 insufficient stock accurately and NOT as stale_version', () => {
      const resultPrefixed = classifyOutboxError('[TM037] Insufficient stock on hand to fulfill this sale.')
      expect(resultPrefixed.errorCode).toBe('insufficient_stock')
      expect(resultPrefixed.errorMessage).toBe('Not enough eggs in stock in the cloud to record this sale or delivery.')
      expect(resultPrefixed.errorCode).not.toBe('stale_version')

      const resultPlain = classifyOutboxError('Insufficient stock on hand to fulfill this sale.')
      expect(resultPlain.errorCode).toBe('insufficient_stock')
    })

    it('classifies stale version codes TM022, TM036, TM045 and text', () => {
      for (const code of ['TM022', 'TM036', 'TM045']) {
        const res = classifyOutboxError(`[${code}] Record was updated on another device.`)
        expect(res.errorCode).toBe('stale_version')
        expect(res.errorMessage).toBe('This record was updated on another device. Discard your copy or review the latest cloud data.')
      }

      const resText = classifyOutboxError('Customer details were updated on another device.')
      expect(resText.errorCode).toBe('stale_version')
    })

    it('classifies TM009, TM010, TM043, TM047, TM050, TM052, TM055 correctly', () => {
      expect(classifyOutboxError('[TM009] An egg size with this name already exists.').errorCode).toBe('duplicate_size')
      expect(classifyOutboxError('[TM010] A farm must keep at least one active egg size.').errorCode).toBe('last_active_size')
      expect(classifyOutboxError('[TM043] This sale has already been voided.').errorCode).toBe('already_voided')
      expect(classifyOutboxError('[TM047] Order cannot be altered because deliveries have been recorded.').errorCode).toBe('order_has_deliveries')
      expect(classifyOutboxError('[TM050] Delivery eggs exceed the remaining quantity on the order.').errorCode).toBe('over_delivered')
      expect(classifyOutboxError('[TM052] Egg size is not part of this order.').errorCode).toBe('size_not_in_order')
      expect(classifyOutboxError('[TM055] Delivery date cannot be earlier than the order date.').errorCode).toBe('date_conflict')
    })

    it('preserves unknown sanitized server error cleanly rather than masking as Cloud rejected this change', () => {
      const customSanitized = 'Tenant database locked for maintenance. Please retry in 1 minute.'
      const res = classifyOutboxError(customSanitized)
      expect(res.errorCode).toBe('sync_rejected')
      expect(res.errorMessage).toBe(customSanitized)

      const fallbackGeneric = classifyOutboxError('rejected')
      expect(fallbackGeneric.errorCode).toBe('sync_rejected')
      expect(fallbackGeneric.errorMessage).toBe('Cloud rejected this change during sync.')
    })
  })
})
