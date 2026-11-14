/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference lib="webworker" />

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { createDrizzleBackedClient, type TenantMeta } from '../../core/db/adapter'
import * as schema from '../../core/db/schema'
import { createTenantDbFromClient, type TenantDb } from '../../core/db/tenant-db'
import { CoreApiError } from '../../core/errors'
import {
  addClient,
  archiveClient,
  listClients,
  restoreClient,
  updateClient,
} from '../../core/repositories/clients'
import { getInventory } from '../../core/repositories/inventory'
import {
  cancelOrder,
  closeOrder,
  createOrder,
  deliverOrder,
  getOrder,
  listOrders,
  setOrderStatus,
  updateOrder,
} from '../../core/repositories/orders'
import {
  deleteProductionDay,
  getProductionDay,
  listProductionDays,
  logProduction,
  replaceProductionDay,
} from '../../core/repositories/production'
import {
  createSale,
  getOnHand,
  getSale,
  listSales,
  updateSale,
  voidSale,
} from '../../core/repositories/sales'
import {
  addSize,
  archiveSize,
  listSizes,
  reorderSizes,
  restoreSize,
  renameSize,
} from '../../core/repositories/sizes'
import type { ApiErrorData, DiscardMutationResult } from '#shared/types/api'
import {
  applyRemoteChangesOps,
  formatFailedMutation,
  migrateLocalSchema,
  summarizeLocalData,
  type LocalSqlDriver,
  type OutboxMutationRow,
} from './sync-helpers'

self.addEventListener('error', (e) => {
  console.error('[worker-uncaught-error]', e.message, e.filename, e.lineno, e.colno, e.error)
})
self.addEventListener('unhandledrejection', (e) => {
  console.error('[worker-unhandled-rejection]', e.reason)
})

export interface WorkerRequest<T = any> {
  id: string
  type:
    | 'EXECUTE'
    | 'PING'
    | 'EXPORT_DATA'
    | 'IMPORT_SNAPSHOT'
    | 'GET_SYNC_STATUS'
    | 'RAW_QUERY'
    | 'GET_PENDING_MUTATIONS'
    | 'MARK_MUTATIONS_PROCESSED'
    | 'RESET_IN_FLIGHT_MUTATIONS'
    | 'GET_LAST_PULLED_VERSION'
    | 'APPLY_REMOTE_CHANGES'
    | 'UPDATE_SYNC_STATE'
    | 'SET_DEVICE_ID'
    | 'MARK_SNAPSHOT_EXPORTED'
    | 'GET_LOCAL_DATA_SUMMARY'
    | 'GET_FAILED_MUTATIONS'
    | 'RETRY_FAILED_MUTATION'
    | 'RETRY_ALL_FAILED_MUTATIONS'
    | 'DISCARD_FAILED_MUTATION'
    | 'RECONCILE_FROM_SNAPSHOT'
    | 'CLEAR_LOCAL_DATA'
  route?: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    path: string
    query?: Record<string, any>
    body?: any
  }
  payload?: T
}

export interface WorkerResponse<T = any> {
  id: string
  ok: boolean
  data?: T
  error?: ApiErrorData & { statusCode: number, statusMessage?: string }
}

let sqliteDb: any = null
let drizzleDb: any = null
let tenantDb: TenantDb | null = null
let tenantMeta: TenantMeta = {
  tenantId: 'local-farm',
  name: 'My Farm',
  eggsPerTray: 30,
  currency: 'PHP',
  deviceId: 'D1',
}

const TABLE_DEFINITIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS farm_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    farm_name TEXT NOT NULL DEFAULT 'My Farm',
    eggs_per_tray INTEGER NOT NULL DEFAULT 30,
    currency TEXT NOT NULL DEFAULT 'PHP',
    device_id TEXT NOT NULL DEFAULT 'D1',
    tier TEXT NOT NULL DEFAULT 'free',
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS local_counters (
    id TEXT PRIMARY KEY,
    next_number INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sale_counters (
    id INTEGER PRIMARY KEY DEFAULT 1,
    next_number INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS order_counters (
    id INTEGER PRIMARY KEY DEFAULT 1,
    next_number INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sizes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    color_slot INTEGER NOT NULL UNIQUE,
    archived_at TEXT,
    default_price REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS size_submissions (
    id TEXT PRIMARY KEY,
    size_id TEXT NOT NULL REFERENCES sizes(id),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS production (
    id TEXT PRIMARY KEY,
    produced_on TEXT NOT NULL,
    size_id TEXT REFERENCES sizes(id),
    quality TEXT NOT NULL,
    eggs INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS production_submissions (
    id TEXT PRIMARY KEY,
    produced_on TEXT NOT NULL,
    had_before INTEGER NOT NULL,
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
  `CREATE TABLE IF NOT EXISTS client_submissions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id),
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL REFERENCES clients(id),
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
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    size_id TEXT NOT NULL REFERENCES sizes(id),
    eggs INTEGER NOT NULL,
    price_per_tray REAL NOT NULL,
    line_total REAL NOT NULL,
    dropped_eggs INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (order_id, size_id)
  );`,
  `CREATE TABLE IF NOT EXISTS order_submissions (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    sale_number TEXT NOT NULL UNIQUE,
    client_id TEXT REFERENCES clients(id),
    type TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    order_id TEXT REFERENCES orders(id),
    order_number TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    voided_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sale_lines (
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    size_id TEXT NOT NULL REFERENCES sizes(id),
    eggs INTEGER NOT NULL,
    price_per_tray REAL NOT NULL,
    line_total REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (sale_id, size_id)
  );`,
  `CREATE TABLE IF NOT EXISTS sale_submissions (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
    needs_reconcile INTEGER NOT NULL DEFAULT 0,
    owner_uid TEXT,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sync_rejections (
    id TEXT PRIMARY KEY,
    mutation_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    mutation_type TEXT NOT NULL,
    entity_ref TEXT,
    error_code TEXT NOT NULL,
    reason TEXT NOT NULL,
    rejected_at TEXT NOT NULL,
    resolved_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS change_log (
    version INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    device_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    data TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS production_date_idx ON production (produced_on);`,
  `CREATE INDEX IF NOT EXISTS production_size_idx ON production (size_id);`,
  `CREATE INDEX IF NOT EXISTS clients_name_idx ON clients (name);`,
  `CREATE INDEX IF NOT EXISTS orders_date_idx ON orders (order_date, order_number);`,
  `CREATE INDEX IF NOT EXISTS orders_client_idx ON orders (client_id);`,
  `CREATE INDEX IF NOT EXISTS order_lines_size_idx ON order_lines (size_id);`,
  `CREATE INDEX IF NOT EXISTS sales_date_idx ON sales (sale_date, sale_number);`,
  `CREATE INDEX IF NOT EXISTS sales_client_idx ON sales (client_id);`,
  `CREATE INDEX IF NOT EXISTS sales_order_idx ON sales (order_id);`,
  `CREATE INDEX IF NOT EXISTS sale_lines_size_idx ON sale_lines (size_id);`,
  `CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox_mutations (status, created_at);`,
  `CREATE INDEX IF NOT EXISTS sync_rejections_unresolved_idx ON sync_rejections (resolved_at, rejected_at);`,
  `CREATE INDEX IF NOT EXISTS change_log_version_idx ON change_log (version);`,
]

async function initDatabase(): Promise<void> {
  const sqlite3 = await (sqlite3InitModule as any)({
    locateFile: (file: string) => {
      if (file.endsWith('.wasm')) {
        return wasmUrl || '/sqlite3.wasm'
      }
      return file
    },
  })
  let initialized = false

  // 1. Primary: Modern SyncAccessHandle Pool VFS (OPFS SAHPool)
  if (typeof (sqlite3 as any).installOpfsSAHPoolVfs === 'function') {
    const delays = [100, 200, 350, 600, 1000]
    for (let attempt = 0; attempt <= delays.length && !initialized; attempt++) {
      try {
        const poolUtil = await (sqlite3 as any).installOpfsSAHPoolVfs({
          name: 'opfs-sahpool',
          clearOnInit: false,
          forceReinitIfPreviouslyFailed: true,
          preserveOnInitFailure: true,
        })
        sqliteDb = new poolUtil.OpfsSAHPoolDb('/farm.sqlite3')
        console.info('[worker] OPFS SAHPool storage initialized successfully (persistence: ACTIVE).')
        initialized = true
      }
      catch (sahErr) {
        if (attempt < delays.length) {
          const delay = delays[attempt]!
          console.warn(`[worker] OPFS SAHPool locked, retrying in ${delay}ms (attempt ${attempt + 1}/${delays.length})...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        else {
          console.warn('[worker] OPFS SAHPool locked by another active tab or unavailable after retries:', sahErr)
        }
      }
    }
  }

  // 2. Fallback: In-memory (headless testing, unsupported environments, or secondary tabs)
  if (!initialized) {
    console.warn('[worker] WARNING: Operating in temporary in-memory database.')
    sqliteDb = new sqlite3.oo1.DB('/farm.sqlite3', 'ct')
  }

  // Execute DDL
  for (const ddl of TABLE_DEFINITIONS) {
    sqliteDb.exec(ddl)
  }

  // Versioned incremental migrations for existing OPFS databases
  await migrateLocalSchema(createSqliteDriver())

  const now = new Date().toISOString()

  // 1. Seed or read Farm Settings
  const farmSettingsRows = sqliteDb.exec({
    sql: 'SELECT * FROM farm_settings WHERE id = ?',
    bind: ['default'],
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as Array<{
    id: string
    farm_name: string
    eggs_per_tray: number
    currency: string
    device_id: string
    onboarding_completed: number
  }>

  if (farmSettingsRows.length === 0) {
    const generatedDeviceId = `D-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
    sqliteDb.exec({
      sql: `INSERT INTO farm_settings (id, farm_name, eggs_per_tray, currency, device_id, onboarding_completed, created_at, updated_at) VALUES ('default', 'My Farm', 30, 'PHP', ?, 0, ?, ?)`,
      bind: [generatedDeviceId, now, now],
    })
    tenantMeta = {
      tenantId: 'local-farm',
      name: 'My Farm',
      eggsPerTray: 30,
      currency: 'PHP',
      deviceId: generatedDeviceId,
      onboardingCompleted: false,
    }
  }
  else {
    const row = farmSettingsRows[0]!
    tenantMeta = {
      tenantId: 'local-farm',
      name: row.farm_name,
      eggsPerTray: Number(row.eggs_per_tray),
      currency: row.currency,
      deviceId: row.device_id,
      onboardingCompleted: Boolean(row.onboarding_completed),
    }
  }

  // 2. Seed sequential counters
  sqliteDb.exec({
    sql: `INSERT OR IGNORE INTO local_counters (id, next_number, updated_at) VALUES ('sales', 1, ?), ('orders', 1, ?)`,
    bind: [now, now],
  })

  // 3. Seed default active sizes (Small #22c55e, Medium #3b82f6, Large #f97316, Jumbo #a855f7)
  const sizeCountRows = sqliteDb.exec({
    sql: 'SELECT COUNT(*) as count FROM sizes',
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as Array<{ count: number }>
  const sizeCount = Number(sizeCountRows[0]?.count ?? 0)

  if (sizeCount === 0) {
    const defaultSizes = [
      { id: crypto.randomUUID(), name: 'Small', sortOrder: 0, colorSlot: 0 },
      { id: crypto.randomUUID(), name: 'Medium', sortOrder: 1, colorSlot: 1 },
      { id: crypto.randomUUID(), name: 'Large', sortOrder: 2, colorSlot: 2 },
      { id: crypto.randomUUID(), name: 'Jumbo', sortOrder: 3, colorSlot: 3 },
    ]
    for (const size of defaultSizes) {
      sqliteDb.exec({
        sql: `INSERT INTO sizes (id, name, sort_order, color_slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        bind: [size.id, size.name, size.sortOrder, size.colorSlot, now, now],
      })
    }
  }

  // 4. Seed Sync State
  sqliteDb.exec({
    sql: `INSERT OR IGNORE INTO sync_state (id, status, updated_at) VALUES ('default', 'local_only', ?)`,
    bind: [now],
  })

  // 5. Connect Drizzle ORM via sqlite-proxy
  drizzleDb = drizzle(
    async (sqlStr, params, method) => {
      const normalizedParams = params.map((p) => {
        if (typeof p === 'boolean') return p ? 1 : 0
        if (p === undefined) return null
        return p
      })

      if (method === 'run') {
        sqliteDb.exec({
          sql: sqlStr,
          bind: normalizedParams,
        })
        return { rows: [] }
      }

      const rows: any[][] = []
      sqliteDb.exec({
        sql: sqlStr,
        bind: normalizedParams,
        rowMode: 'array',
        returnValue: 'resultRows',
        resultRows: rows,
      })

      if (method === 'get') {
        return { rows: (rows[0] ? (Array.isArray(rows[0]) ? rows[0] : [rows[0]]) : []) as any[] }
      }
      return { rows: (rows ?? []) as any[] }
    },
    { schema },
  )

  const tenantClient = createDrizzleBackedClient(drizzleDb, tenantMeta)
  tenantDb = createTenantDbFromClient(tenantClient as any, 'local-farm')
}

const dbReadyPromise = initDatabase().catch((err) => {
  console.error('[worker] Failed to bootstrap database:', err)
  throw err
})

async function recordOutboxMutation(mutationType: string, payload: unknown) {
  try {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    sqliteDb.exec({
      sql: `INSERT INTO outbox_mutations (id, device_id, mutation_type, payload, occurred_at, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      bind: [id, tenantMeta.deviceId || 'D1', mutationType, JSON.stringify(payload), now, now],
    })
  }
  catch (err) {
    console.error('[worker] Failed to append outbox mutation:', err)
  }
}

async function handleRoute(
  method: string,
  path: string,
  query: Record<string, any> = {},
  body: any = null,
): Promise<any> {
  await dbReadyPromise
  if (!tenantDb) throw new Error('Tenant DB is not ready')

  const normalizedPath = path.split('?')[0] || ''

  // /api/me
  if (method === 'GET' && normalizedPath === '/api/me') {
    const farmRows = sqliteDb.exec({
      sql: 'SELECT farm_name, eggs_per_tray, currency, device_id, onboarding_completed, tier FROM farm_settings WHERE id = ?',
      bind: ['default'],
      rowMode: 'object',
      returnValue: 'resultRows',
    }) as Array<{ farm_name: string, eggs_per_tray: number, currency: string, device_id: string, onboarding_completed: number, tier?: string }>

    const farmRow = farmRows[0] || {
      farm_name: 'My Farm',
      eggs_per_tray: 30,
      currency: 'PHP',
      device_id: 'D1',
      onboarding_completed: 0,
      tier: 'free',
    }
    const tier = (farmRow.tier === 'premium' ? 'premium' : 'free') as 'free' | 'premium'
    const sizes = await listSizes(tenantDb)
    return {
      email: '',
      tier,
      isFree: tier === 'free',
      farm: {
        id: 'local-farm',
        name: farmRow.farm_name,
        eggsPerTray: Number(farmRow.eggs_per_tray),
        currency: farmRow.currency,
        deviceId: farmRow.device_id,
        onboardingCompleted: Boolean(farmRow.onboarding_completed),
        isFree: tier === 'free',
        tier,
        sizes,
      },
      user: null,
    }
  }

  // /api/farm (Onboarding & Farm Settings updates)
  if ((method === 'PUT' || method === 'POST') && normalizedPath === '/api/farm') {
    const now = new Date().toISOString()
    const farmName = body?.farmName?.trim() || tenantMeta.name || 'My Farm'
    const eggsPerTray = Number(body?.eggsPerTray ?? tenantMeta.eggsPerTray ?? 30)
    const currency = body?.currency?.trim() || tenantMeta.currency || 'PHP'

    sqliteDb.exec({
      sql: `UPDATE farm_settings SET farm_name = ?, eggs_per_tray = ?, currency = ?, onboarding_completed = 1, updated_at = ? WHERE id = ?`,
      bind: [farmName, eggsPerTray, currency, now, 'default'],
    })

    tenantMeta = {
      ...tenantMeta,
      name: farmName,
      eggsPerTray,
      currency,
      onboardingCompleted: true,
    }

    // Append update_farm_settings to outbox mutations for cloud synchronization
    const mutationId = crypto.randomUUID()
    sqliteDb.exec({
      sql: `INSERT INTO outbox_mutations (id, device_id, mutation_type, payload, occurred_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        mutationId,
        tenantMeta.deviceId || 'D1',
        'update_farm_settings',
        JSON.stringify({ farmName, eggsPerTray, currency }),
        now,
        'pending',
        now,
      ],
    })

    const farmRows = sqliteDb.exec({
      sql: 'SELECT tier FROM farm_settings WHERE id = ?',
      bind: ['default'],
      rowMode: 'object',
      returnValue: 'resultRows',
    }) as Array<{ tier?: string }>
    const tier = (farmRows[0]?.tier === 'premium' ? 'premium' : 'free') as 'free' | 'premium'

    const sizes = await listSizes(tenantDb)
    return {
      success: true,
      farm: {
        id: 'local-farm',
        name: farmName,
        eggsPerTray,
        currency,
        deviceId: tenantMeta.deviceId || 'D1',
        onboardingCompleted: true,
        isFree: tier === 'free',
        tier,
        sizes,
      },
    }
  }

  // /api/sizes
  if (method === 'GET' && normalizedPath === '/api/sizes') {
    return { sizes: await listSizes(tenantDb) }
  }
  if (method === 'POST' && normalizedPath === '/api/sizes') {
    const result = await addSize(tenantDb, body)
    await recordOutboxMutation('add_size', { ...body, id: (result as any)?.size?.id || (result as any)?.id })
    return result
  }
  let match = /^\/api\/sizes\/([^/]+)\/archive$/.exec(normalizedPath)
  if (method === 'POST' && match) {
    const id = decodeURIComponent(match[1]!)
    const result = await archiveSize(tenantDb, id)
    await recordOutboxMutation('archive_size', { id })
    return result
  }
  match = /^\/api\/sizes\/([^/]+)\/restore$/.exec(normalizedPath)
  if (method === 'POST' && match) {
    const id = decodeURIComponent(match[1]!)
    const result = await restoreSize(tenantDb, id)
    await recordOutboxMutation('restore_size', { id })
    return result
  }
  match = /^\/api\/sizes\/([^/]+)(?:\/update)?$/.exec(normalizedPath)
  if ((method === 'PATCH' || method === 'POST') && match && match[1] !== 'order') {
    const id = decodeURIComponent(match[1]!)
    const name = body?.name ?? ''
    const defaultPrice = body?.defaultPrice !== undefined ? body.defaultPrice : undefined
    const result = await renameSize(tenantDb, id, name, defaultPrice)
    await recordOutboxMutation('rename_size', { id, name, defaultPrice })
    return result
  }
  if (method === 'PUT' && normalizedPath === '/api/sizes/order') {
    const result = await reorderSizes(tenantDb, body)
    await recordOutboxMutation('reorder_sizes', body)
    return result
  }

  // /api/clients
  if (method === 'GET' && normalizedPath === '/api/clients') {
    return { clients: await listClients(tenantDb) }
  }
  if (method === 'POST' && normalizedPath === '/api/clients') {
    const result = await addClient(tenantDb, body)
    await recordOutboxMutation('add_client', { ...body, id: (result as any)?.client?.id || (result as any)?.id })
    return result
  }
  match = /^\/api\/clients\/([^/]+)\/archive$/.exec(normalizedPath)
  if (method === 'POST' && match) {
    const id = decodeURIComponent(match[1]!)
    const result = await archiveClient(tenantDb, id)
    await recordOutboxMutation('archive_client', { id })
    return result
  }
  match = /^\/api\/clients\/([^/]+)\/restore$/.exec(normalizedPath)
  if (method === 'POST' && match) {
    const id = decodeURIComponent(match[1]!)
    const result = await restoreClient(tenantDb, id)
    await recordOutboxMutation('restore_client', { id })
    return result
  }
  match = /^\/api\/clients\/([^/]+)(?:\/update)?$/.exec(normalizedPath)
  if ((method === 'PUT' || method === 'POST') && match) {
    const id = decodeURIComponent(match[1]!)
    const result = await updateClient(tenantDb, id, body)
    await recordOutboxMutation('update_client', { id, ...body })
    return result
  }

  // /api/production
  if (method === 'GET' && (normalizedPath === '/api/production/days' || normalizedPath === '/api/production/range')) {
    return await listProductionDays(tenantDb, { from: query.from, to: query.to })
  }
  if (method === 'GET' && normalizedPath === '/api/production/day') {
    const date = query.date as string
    return { day: await getProductionDay(tenantDb, date) }
  }
  match = /^\/api\/production\/days\/([^/]+)$/.exec(normalizedPath)
  if (match) {
    const date = decodeURIComponent(match[1]!)
    if (method === 'GET') {
      return { day: await getProductionDay(tenantDb, date) }
    }
    if (method === 'PUT') {
      const day = await replaceProductionDay(tenantDb, date, body)
      await recordOutboxMutation('replace_production_day', { date, ...body })
      return { day }
    }
    if (method === 'DELETE') {
      const removed = await deleteProductionDay(tenantDb, date)
      await recordOutboxMutation('delete_production_day', { date })
      return { removed }
    }
  }
  if (method === 'POST' && (normalizedPath === '/api/production/entries' || normalizedPath === '/api/production/day')) {
    const result = await logProduction(tenantDb, body)
    await recordOutboxMutation('log_production', body)
    return result
  }

  // /api/sales
  if (method === 'GET' && normalizedPath === '/api/sales') {
    return await listSales(tenantDb, {
      from: query.from,
      to: query.to,
      type: query.type,
      clientId: query.clientId,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
      includeVoided: query.includeVoided === 'true' || query.includeVoided === true,
    })
  }
  if (method === 'GET' && (normalizedPath === '/api/sales/on-hand' || normalizedPath === '/api/inventory/on-hand')) {
    const sizeIds = Array.isArray(query.sizeId)
      ? query.sizeId
      : query.sizeId ? [query.sizeId] : undefined
    return await getOnHand(tenantDb, sizeIds)
  }
  if (method === 'POST' && normalizedPath === '/api/sales') {
    const result = await createSale(tenantDb, body)
    await recordOutboxMutation('create_sale', { ...body, id: (result as any)?.sale?.id || (result as any)?.id, saleNumber: (result as any)?.sale?.saleNumber || (result as any)?.saleNumber })
    return result
  }
  match = /^\/api\/sales\/([^/]+)\/void$/.exec(normalizedPath)
  if (method === 'POST' && match) {
    const id = decodeURIComponent(match[1]!)
    const result = await voidSale(tenantDb, id, body)
    await recordOutboxMutation('void_sale', { id, ...body })
    return result
  }
  match = /^\/api\/sales\/([^/]+)(?:\/update)?$/.exec(normalizedPath)
  if (match) {
    const id = decodeURIComponent(match[1]!)
    if (method === 'GET') {
      const sale = await getSale(tenantDb, id)
      return { sale }
    }
    if (method === 'PUT' || method === 'POST') {
      const result = await updateSale(tenantDb, id, body)
      await recordOutboxMutation('update_sale', { id, ...body })
      return result
    }
  }

  // /api/orders
  if (method === 'GET' && normalizedPath === '/api/orders') {
    return await listOrders(tenantDb, {
      view: query.view,
      clientId: query.clientId,
      from: query.from,
      to: query.to,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
    })
  }
  if (method === 'POST' && normalizedPath === '/api/orders') {
    const result = await createOrder(tenantDb, body)
    await recordOutboxMutation('create_order', { ...body, id: (result as any)?.order?.id || (result as any)?.id, orderNumber: (result as any)?.order?.orderNumber || (result as any)?.orderNumber })
    return result
  }
  match = /^\/api\/orders\/([^/]+)\/cancel$/.exec(normalizedPath)
  if (method === 'POST' && match) {
    const id = decodeURIComponent(match[1]!)
    const result = await cancelOrder(tenantDb, id)
    await recordOutboxMutation('cancel_order', { id })
    return result
  }
  match = /^\/api\/orders\/([^/]+)\/status$/.exec(normalizedPath)
  if ((method === 'PATCH' || method === 'POST') && match) {
    const id = decodeURIComponent(match[1]!)
    const result = await setOrderStatus(tenantDb, id, body.status)
    await recordOutboxMutation('set_order_status', { id, status: body.status })
    return result
  }
  match = /^\/api\/orders\/([^/]+)\/(?:close-short|close)$/.exec(normalizedPath)
  if (method === 'POST' && match) {
    const id = decodeURIComponent(match[1]!)
    const result = await closeOrder(tenantDb, id, body)
    await recordOutboxMutation('close_order', { id, ...body })
    return result
  }
  match = /^\/api\/orders\/([^/]+)\/(?:deliveries|deliver)$/.exec(normalizedPath)
  if (method === 'POST' && match) {
    const id = decodeURIComponent(match[1]!)
    const result = await deliverOrder(tenantDb, id, body)
    await recordOutboxMutation('deliver_order', {
      id,
      ...body,
      saleId: (result as any)?.sale?.id,
      saleNumber: (result as any)?.sale?.saleNumber,
    })
    return result
  }
  match = /^\/api\/orders\/([^/]+)(?:\/update)?$/.exec(normalizedPath)
  if (match) {
    const id = decodeURIComponent(match[1]!)
    if (method === 'GET') {
      const order = await getOrder(tenantDb, id)
      return { order }
    }
    if (method === 'PUT' || method === 'POST') {
      const result = await updateOrder(tenantDb, id, body)
      await recordOutboxMutation('update_order', { id, ...body })
      return result
    }
  }

  // /api/inventory
  if (method === 'GET' && normalizedPath === '/api/inventory') {
    return await getInventory(tenantDb)
  }

  throw new CoreApiError(404, 'not_found')
}

async function exportFullSnapshot() {
  await dbReadyPromise
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    farmSettings: sqliteDb.exec({ sql: 'SELECT * FROM farm_settings', rowMode: 'object', returnValue: 'resultRows' }),
    localCounters: sqliteDb.exec({ sql: 'SELECT * FROM local_counters', rowMode: 'object', returnValue: 'resultRows' }),
    sizes: sqliteDb.exec({ sql: 'SELECT * FROM sizes', rowMode: 'object', returnValue: 'resultRows' }),
    clients: sqliteDb.exec({ sql: 'SELECT * FROM clients', rowMode: 'object', returnValue: 'resultRows' }),
    production: sqliteDb.exec({ sql: 'SELECT * FROM production', rowMode: 'object', returnValue: 'resultRows' }),
    productionSubmissions: sqliteDb.exec({ sql: 'SELECT * FROM production_submissions', rowMode: 'object', returnValue: 'resultRows' }),
    sales: sqliteDb.exec({ sql: 'SELECT * FROM sales', rowMode: 'object', returnValue: 'resultRows' }),
    saleLines: sqliteDb.exec({ sql: 'SELECT * FROM sale_lines', rowMode: 'object', returnValue: 'resultRows' }),
    orders: sqliteDb.exec({ sql: 'SELECT * FROM orders', rowMode: 'object', returnValue: 'resultRows' }),
    orderLines: sqliteDb.exec({ sql: 'SELECT * FROM order_lines', rowMode: 'object', returnValue: 'resultRows' }),
  }
}

function createSqliteDriver(): LocalSqlDriver {
  return {
    exec: (sql: string, bind?: any[]) => {
      if (bind && bind.length > 0) {
        sqliteDb.exec({ sql, bind })
      }
      else {
        sqliteDb.exec(sql)
      }
    },
    query: <T = Record<string, any>>(sql: string, bind?: any[]): T[] => {
      return sqliteDb.exec({
        sql,
        ...(bind && bind.length > 0 ? { bind } : {}),
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as T[]
    },
  }
}

async function importFullSnapshot(
  snapshot: any,
  latestVersion = 0,
  options: { preserveOutbox?: boolean, tier?: 'free' | 'premium', ownerUid?: string | null } = {},
) {
  await dbReadyPromise
  const preserveOutbox = Boolean(options.preserveOutbox)
  const targetTier: 'free' | 'premium' = options.tier ?? 'premium'
  sqliteDb.exec('BEGIN TRANSACTION;')
  try {
    sqliteDb.exec(`
      DELETE FROM sale_lines;
      DELETE FROM sales;
      DELETE FROM sale_submissions;
      DELETE FROM order_lines;
      DELETE FROM orders;
      DELETE FROM order_submissions;
      DELETE FROM production;
      DELETE FROM production_submissions;
      DELETE FROM clients;
      DELETE FROM client_submissions;
      DELETE FROM sizes;
      DELETE FROM size_submissions;
      DELETE FROM farm_settings;
      DELETE FROM local_counters;
    `)
    if (!preserveOutbox) {
      sqliteDb.exec('DELETE FROM outbox_mutations;')
    }

    const now = new Date().toISOString()
    const rawFs = snapshot.farmSettings ?? snapshot.farm_settings
    const fs = Array.isArray(rawFs) ? rawFs[0] : rawFs

    const farmName = (fs && (fs.farm_name ?? fs.farmName ?? fs.name)) || tenantMeta.name || 'My Farm'
    const eggsPerTray = Number(fs && (fs.eggs_per_tray ?? fs.eggsPerTray) !== undefined ? (fs.eggs_per_tray ?? fs.eggsPerTray) : (tenantMeta.eggsPerTray || 30))
    const currency = (fs && fs.currency) || tenantMeta.currency || 'PHP'
    const preservedDeviceId = tenantMeta.deviceId && tenantMeta.deviceId !== 'D1' ? tenantMeta.deviceId : null
    const deviceId = preservedDeviceId || (fs && (fs.device_id ?? fs.deviceId)) || snapshot.deviceId || snapshot.device_id || tenantMeta.deviceId || 'D1'
    const resolvedTier = (options.tier ?? (fs?.tier === 'premium' || fs?.tier === 'free' ? fs.tier : targetTier)) as 'free' | 'premium'
    const createdAt = (fs && (fs.created_at ?? fs.createdAt)) || now
    const updatedAt = (fs && (fs.updated_at ?? fs.updatedAt)) || now

    sqliteDb.exec({
      sql: `INSERT OR REPLACE INTO farm_settings (id, farm_name, eggs_per_tray, currency, device_id, tier, onboarding_completed, created_at, updated_at) VALUES ('default', ?, ?, ?, ?, ?, 1, ?, ?)`,
      bind: [farmName, eggsPerTray, currency, deviceId, resolvedTier, createdAt, updatedAt],
    })

    tenantMeta = {
      ...tenantMeta,
      name: farmName,
      eggsPerTray,
      currency,
      deviceId,
      onboardingCompleted: true,
    }
    const tenantClient = createDrizzleBackedClient(drizzleDb, tenantMeta)
    tenantDb = createTenantDbFromClient(tenantClient as any, 'local-farm')

    for (const lc of snapshot.localCounters || snapshot.local_counters || []) {
      sqliteDb.exec({
        sql: `INSERT INTO local_counters (id, next_number, updated_at) VALUES (?, ?, ?)`,
        bind: [lc.id, lc.next_number ?? lc.nextNumber, lc.updated_at ?? lc.updatedAt ?? now],
      })
    }

    for (const s of snapshot.sizes || []) {
      sqliteDb.exec({
        sql: `INSERT INTO sizes (id, name, sort_order, color_slot, archived_at, default_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          s.id,
          s.name,
          s.sort_order ?? s.sortOrder,
          s.color_slot ?? s.colorSlot,
          s.archived_at ?? s.archivedAt ?? null,
          (s.default_price !== undefined ? s.default_price : s.defaultPrice) ?? null,
          s.created_at ?? s.createdAt ?? now,
          s.updated_at ?? s.updatedAt ?? now,
        ],
      })
    }

    for (const c of snapshot.clients || []) {
      sqliteDb.exec({
        sql: `INSERT INTO clients (id, name, phone, default_price, archived_at, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          c.id,
          c.name,
          c.phone ?? null,
          c.default_price ?? c.defaultPrice ?? null,
          c.archived_at ?? c.archivedAt ?? null,
          c.version ?? 1,
          c.created_at ?? c.createdAt ?? now,
          c.updated_at ?? c.updatedAt ?? now,
        ],
      })
    }

    for (const p of snapshot.production || []) {
      sqliteDb.exec({
        sql: `INSERT OR REPLACE INTO production (id, produced_on, size_id, quality, eggs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          p.id,
          p.produced_on ?? p.producedOn,
          p.size_id ?? p.sizeId ?? null,
          p.quality,
          p.eggs,
          p.created_at ?? p.createdAt ?? now,
          p.updated_at ?? p.updatedAt ?? now,
        ],
      })
    }

    for (const ps of snapshot.productionSubmissions || snapshot.production_submissions || []) {
      sqliteDb.exec({
        sql: `INSERT OR REPLACE INTO production_submissions (id, produced_on, had_before, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        bind: [
          ps.id,
          ps.produced_on ?? ps.producedOn,
          ps.had_before !== undefined ? (ps.had_before ? 1 : 0) : (ps.hadBefore ? 1 : 0),
          ps.created_at ?? ps.createdAt ?? now,
          ps.updated_at ?? ps.updatedAt ?? now,
        ],
      })
    }

    for (const s of snapshot.sales || []) {
      sqliteDb.exec({
        sql: `INSERT INTO sales (id, sale_number, client_id, type, sale_date, order_id, order_number, version, voided_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          s.id,
          s.sale_number ?? s.saleNumber,
          s.client_id ?? s.clientId ?? null,
          s.type,
          s.sale_date ?? s.saleDate,
          s.order_id ?? s.orderId ?? null,
          s.order_number ?? s.orderNumber ?? null,
          s.version ?? 1,
          s.voided_at ?? s.voidedAt ?? null,
          s.created_at ?? s.createdAt ?? now,
          s.updated_at ?? s.updatedAt ?? now,
        ],
      })
    }

    for (const sl of snapshot.saleLines || snapshot.sale_lines || []) {
      sqliteDb.exec({
        sql: `INSERT INTO sale_lines (sale_id, size_id, eggs, price_per_tray, line_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          sl.sale_id ?? sl.saleId,
          sl.size_id ?? sl.sizeId,
          sl.eggs,
          sl.price_per_tray ?? sl.pricePerTray,
          sl.line_total ?? sl.lineTotal,
          sl.created_at ?? sl.createdAt ?? now,
          sl.updated_at ?? sl.updatedAt ?? now,
        ],
      })
    }

    for (const o of snapshot.orders || []) {
      sqliteDb.exec({
        sql: `INSERT INTO orders (id, order_number, client_id, order_date, wanted_by, status, cancelled_at, closed_short_at, converted_from_sale_number, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          o.id,
          o.order_number ?? o.orderNumber,
          o.client_id ?? o.clientId,
          o.order_date ?? o.orderDate,
          o.wanted_by ?? o.wantedBy ?? null,
          o.status,
          o.cancelled_at ?? o.cancelledAt ?? null,
          o.closed_short_at ?? o.closedShortAt ?? null,
          o.converted_from_sale_number ?? o.convertedFromSaleNumber ?? null,
          o.version ?? 1,
          o.created_at ?? o.createdAt ?? now,
          o.updated_at ?? o.updatedAt ?? now,
        ],
      })
    }

    for (const ol of snapshot.orderLines || snapshot.order_lines || []) {
      sqliteDb.exec({
        sql: `INSERT INTO order_lines (order_id, size_id, eggs, price_per_tray, line_total, dropped_eggs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          ol.order_id ?? ol.orderId,
          ol.size_id ?? ol.sizeId,
          ol.eggs ?? ol.orderedEggs ?? 0,
          ol.price_per_tray ?? ol.pricePerTray,
          ol.line_total ?? ol.lineTotal,
          ol.dropped_eggs ?? ol.droppedEggs ?? 0,
          ol.created_at ?? ol.createdAt ?? now,
          ol.updated_at ?? ol.updatedAt ?? now,
        ],
      })
    }

    if (latestVersion > 0) {
      sqliteDb.exec({
        sql: `UPDATE sync_state SET last_pulled_version = ?, last_pulled_at = ?, needs_reconcile = 0, status = 'synced', last_error = NULL, owner_uid = COALESCE(?, owner_uid), updated_at = ? WHERE id = 'default'`,
        bind: [latestVersion, now, options.ownerUid ?? null, now],
      })
    }
    else {
      sqliteDb.exec({
        sql: `UPDATE sync_state SET needs_reconcile = 0, owner_uid = COALESCE(?, owner_uid), updated_at = ? WHERE id = 'default'`,
        bind: [options.ownerUid ?? null, now],
      })
    }

    sqliteDb.exec('COMMIT;')
  }
  catch (err) {
    sqliteDb.exec('ROLLBACK;')
    throw err
  }
}

function respond(response: WorkerResponse) {
  try {
    self.postMessage(response)
  }
  catch {
    try {
      const sanitized = JSON.parse(JSON.stringify(response))
      self.postMessage(sanitized)
    }
    catch (e: any) {
      self.postMessage({
        id: response.id,
        ok: false,
        error: {
          statusCode: 500,
          statusMessage: e?.message || 'Serialization error',
          code: 'internal',
        },
      })
    }
  }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, type, route, payload } = e.data

  try {
    if (type === 'PING') {
      await dbReadyPromise
      respond({ id, ok: true, data: { pong: true } })
      return
    }

    if (type === 'EXECUTE') {
      if (!route) throw new Error('Missing route payload for EXECUTE')
      const result = await handleRoute(route.method, route.path, route.query, route.body)
      respond({ id, ok: true, data: result })
      return
    }

    if (type === 'EXPORT_DATA') {
      const data = await exportFullSnapshot()
      respond({ id, ok: true, data })
      return
    }

    if (type === 'IMPORT_SNAPSHOT') {
      const snap = (payload && typeof payload === 'object' && 'snapshot' in payload) ? payload.snapshot : payload
      const latestVersion = Number(payload?.latestVersion ?? payload?.version ?? snap?.latestVersion ?? 0)
      await importFullSnapshot(snap, latestVersion, {
        preserveOutbox: Boolean(payload?.preserveOutbox),
        tier: payload?.tier === 'free' || payload?.tier === 'premium' ? payload.tier : undefined,
        ownerUid: payload?.ownerUid !== undefined ? payload.ownerUid : undefined,
      })
      respond({ id, ok: true, data: { success: true } })
      return
    }

    if (type === 'CLEAR_LOCAL_DATA') {
      await dbReadyPromise
      const now = new Date().toISOString()
      const preservedDeviceId = tenantMeta.deviceId && tenantMeta.deviceId !== 'D1'
        ? tenantMeta.deviceId
        : `D-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
      sqliteDb.exec('BEGIN TRANSACTION;')
      try {
        sqliteDb.exec(`
          DELETE FROM sale_lines;
          DELETE FROM sales;
          DELETE FROM sale_submissions;
          DELETE FROM order_lines;
          DELETE FROM orders;
          DELETE FROM order_submissions;
          DELETE FROM production;
          DELETE FROM production_submissions;
          DELETE FROM clients;
          DELETE FROM client_submissions;
          DELETE FROM sizes;
          DELETE FROM size_submissions;
          DELETE FROM farm_settings;
          DELETE FROM local_counters;
          DELETE FROM outbox_mutations;
          DELETE FROM change_log;
          DELETE FROM sync_rejections;
        `)
        sqliteDb.exec({
          sql: `INSERT INTO farm_settings (id, farm_name, eggs_per_tray, currency, device_id, tier, onboarding_completed, created_at, updated_at) VALUES ('default', 'My Farm', 30, 'PHP', ?, 'free', 0, ?, ?)`,
          bind: [preservedDeviceId, now, now],
        })
        sqliteDb.exec({
          sql: `INSERT INTO local_counters (id, next_number, updated_at) VALUES ('sales', 1, ?), ('orders', 1, ?)`,
          bind: [now, now],
        })
        const defaultSizes = [
          { id: crypto.randomUUID(), name: 'Small', sortOrder: 0, colorSlot: 0 },
          { id: crypto.randomUUID(), name: 'Medium', sortOrder: 1, colorSlot: 1 },
          { id: crypto.randomUUID(), name: 'Large', sortOrder: 2, colorSlot: 2 },
          { id: crypto.randomUUID(), name: 'Jumbo', sortOrder: 3, colorSlot: 3 },
        ]
        for (const size of defaultSizes) {
          sqliteDb.exec({
            sql: `INSERT INTO sizes (id, name, sort_order, color_slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
            bind: [size.id, size.name, size.sortOrder, size.colorSlot, now, now],
          })
        }
        sqliteDb.exec({
          sql: `UPDATE sync_state SET tenant_id = NULL, cloud_url = NULL, cloud_token = NULL, owner_uid = NULL, last_pulled_version = 0, last_pulled_at = NULL, last_pushed_at = NULL, status = 'local_only', last_error = NULL, needs_reconcile = 0, updated_at = ? WHERE id = 'default'`,
          bind: [now],
        })
        sqliteDb.exec('COMMIT;')
        tenantMeta = {
          tenantId: 'local-farm',
          name: 'My Farm',
          eggsPerTray: 30,
          currency: 'PHP',
          deviceId: preservedDeviceId,
          onboardingCompleted: false,
        }
        const tenantClient = createDrizzleBackedClient(drizzleDb, tenantMeta)
        tenantDb = createTenantDbFromClient(tenantClient as any, 'local-farm')
        respond({ id, ok: true, data: { success: true } })
      }
      catch (err) {
        sqliteDb.exec('ROLLBACK;')
        throw err
      }
      return
    }

    if (type === 'RECONCILE_FROM_SNAPSHOT') {
      const snap = (payload && typeof payload === 'object' && 'snapshot' in payload) ? payload.snapshot : payload
      const latestVersion = Number(payload?.latestVersion ?? payload?.version ?? snap?.latestVersion ?? 0)
      await importFullSnapshot(snap, latestVersion, {
        preserveOutbox: true,
        tier: 'premium',
      })
      respond({ id, ok: true, data: { success: true } })
      return
    }

    if (type === 'GET_LOCAL_DATA_SUMMARY') {
      await dbReadyPromise
      const summary = await summarizeLocalData(createSqliteDriver())
      respond({ id, ok: true, data: summary })
      return
    }

    if (type === 'GET_FAILED_MUTATIONS') {
      await dbReadyPromise
      const rows = sqliteDb.exec({
        sql: `SELECT id, device_id, mutation_type, payload, occurred_at, status, error, created_at
              FROM outbox_mutations
              WHERE status = 'failed'
              ORDER BY created_at ASC`,
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as OutboxMutationRow[]
      const mutations = rows.map((row, idx) => formatFailedMutation(row, idx + 1))
      respond({ id, ok: true, data: { mutations } })
      return
    }

    if (type === 'RETRY_FAILED_MUTATION') {
      await dbReadyPromise
      const mutationId = String(payload?.id || '')
      if (!mutationId) {
        throw new CoreApiError(400, 'validation_failed', { code: 'TM005', reason: 'missing_mutation_id' })
      }
      sqliteDb.exec({
        sql: `UPDATE outbox_mutations SET status = 'pending', error = NULL WHERE id = ? AND status = 'failed'`,
        bind: [mutationId],
      })
      const remRows = sqliteDb.exec({
        sql: `SELECT COUNT(*) as count FROM outbox_mutations WHERE status = 'failed'`,
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as Array<{ count: number }>
      respond({ id, ok: true, data: { retried: true, remainingFailedCount: Number(remRows[0]?.count ?? 0) } })
      return
    }

    if (type === 'RETRY_ALL_FAILED_MUTATIONS') {
      await dbReadyPromise
      sqliteDb.exec(`UPDATE outbox_mutations SET status = 'pending', error = NULL WHERE status = 'failed'`)
      respond({ id, ok: true, data: { success: true } })
      return
    }

    if (type === 'DISCARD_FAILED_MUTATION') {
      await dbReadyPromise
      const mutationId = String(payload?.id || '')
      if (!mutationId) {
        throw new CoreApiError(400, 'validation_failed', { code: 'TM005', reason: 'missing_mutation_id' })
      }
      const now = new Date().toISOString()
      let discarded = false
      sqliteDb.exec('BEGIN TRANSACTION;')
      try {
        const existing = sqliteDb.exec({
          sql: `SELECT id FROM outbox_mutations WHERE id = ? AND status = 'failed'`,
          bind: [mutationId],
          rowMode: 'object',
          returnValue: 'resultRows',
        }) as Array<{ id: string }>
        if (existing.length > 0) {
          sqliteDb.exec({
            sql: `DELETE FROM outbox_mutations WHERE id = ? AND status = 'failed'`,
            bind: [mutationId],
          })
          discarded = true
          sqliteDb.exec({
            sql: `UPDATE sync_state SET needs_reconcile = 1, updated_at = ? WHERE id = 'default'`,
            bind: [now],
          })
        }
        sqliteDb.exec('COMMIT;')
      }
      catch (err) {
        sqliteDb.exec('ROLLBACK;')
        throw err
      }

      const pendingRows = sqliteDb.exec({
        sql: `SELECT COUNT(*) as count FROM outbox_mutations WHERE status IN ('pending', 'in_flight')`,
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as Array<{ count: number }>
      const failedRows = sqliteDb.exec({
        sql: `SELECT COUNT(*) as count FROM outbox_mutations WHERE status = 'failed'`,
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as Array<{ count: number }>
      const syncRows = sqliteDb.exec({
        sql: `SELECT needs_reconcile FROM sync_state WHERE id = 'default'`,
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as Array<{ needs_reconcile?: number }>

      const result: DiscardMutationResult = {
        discarded,
        remainingPendingCount: Number(pendingRows[0]?.count ?? 0),
        remainingFailedCount: Number(failedRows[0]?.count ?? 0),
        needsReconcile: Boolean(syncRows[0]?.needs_reconcile),
      }
      respond({ id, ok: true, data: result })
      return
    }

    if (type === 'GET_SYNC_STATUS') {
      await dbReadyPromise
      const syncRows = sqliteDb.exec({
        sql: 'SELECT * FROM sync_state WHERE id = ?',
        bind: ['default'],
        rowMode: 'object',
        returnValue: 'resultRows',
      })
      const outboxCountRows = sqliteDb.exec({
        sql: 'SELECT COUNT(*) as count FROM outbox_mutations WHERE status IN (\'pending\', \'in_flight\')',
        rowMode: 'object',
        returnValue: 'resultRows',
      })
      const failedCountRows = sqliteDb.exec({
        sql: 'SELECT COUNT(*) as count FROM outbox_mutations WHERE status = \'failed\'',
        rowMode: 'object',
        returnValue: 'resultRows',
      })
      const syncRow = syncRows[0] || null
      respond({
        id,
        ok: true,
        data: {
          syncState: syncRow,
          pendingOutboxCount: Number(outboxCountRows[0]?.count ?? 0),
          failedOutboxCount: Number(failedCountRows[0]?.count ?? 0),
          needsReconcile: Boolean((syncRow as any)?.needs_reconcile),
        },
      })
      return
    }

    if (type === 'GET_PENDING_MUTATIONS') {
      await dbReadyPromise
      const limit = Number(payload?.limit || 50)
      const rows = sqliteDb.exec({
        sql: 'SELECT id, device_id, mutation_type, payload, occurred_at FROM outbox_mutations WHERE status = \'pending\' ORDER BY created_at ASC LIMIT ?',
        bind: [limit],
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as Array<{
        id: string
        device_id: string
        mutation_type: string
        payload: string
        occurred_at: string
      }>

      if (rows.length > 0) {
        const ids = rows.map(r => r.id)
        const placeholders = ids.map(() => '?').join(', ')
        sqliteDb.exec({
          sql: `UPDATE outbox_mutations SET status = 'in_flight' WHERE id IN (${placeholders})`,
          bind: ids,
        })
      }

      const mutations = rows.map((r) => {
        let parsedPayload: any
        try {
          parsedPayload = JSON.parse(r.payload)
        }
        catch {
          parsedPayload = r.payload
        }
        return {
          id: r.id,
          deviceId: r.device_id,
          type: r.mutation_type,
          payload: parsedPayload,
          occurredAt: r.occurred_at,
        }
      })

      respond({ id, ok: true, data: { mutations } })
      return
    }

    if (type === 'MARK_MUTATIONS_PROCESSED') {
      await dbReadyPromise
      const results: Array<{ id: string, status: 'applied' | 'conflict_lww' | 'rejected', error?: string }> = payload?.results || []
      const now = new Date().toISOString()
      sqliteDb.exec('BEGIN TRANSACTION;')
      try {
        for (const res of results) {
          if (res.status === 'applied' || res.status === 'conflict_lww') {
            sqliteDb.exec({
              sql: 'DELETE FROM outbox_mutations WHERE id = ?',
              bind: [res.id],
            })
          }
          else if (res.status === 'rejected') {
            sqliteDb.exec({
              sql: 'UPDATE outbox_mutations SET status = \'failed\', error = ? WHERE id = ?',
              bind: [res.error || 'rejected', res.id],
            })
          }
        }
        sqliteDb.exec({
          sql: 'UPDATE sync_state SET last_pushed_at = ?, updated_at = ? WHERE id = \'default\'',
          bind: [now, now],
        })
        sqliteDb.exec('COMMIT;')
        respond({ id, ok: true, data: { success: true } })
      }
      catch (err) {
        sqliteDb.exec('ROLLBACK;')
        throw err
      }
      return
    }

    if (type === 'RESET_IN_FLIGHT_MUTATIONS') {
      await dbReadyPromise
      sqliteDb.exec('UPDATE outbox_mutations SET status = \'pending\' WHERE status = \'in_flight\'')
      respond({ id, ok: true, data: { success: true } })
      return
    }

    if (type === 'GET_LAST_PULLED_VERSION') {
      await dbReadyPromise
      const rows = sqliteDb.exec({
        sql: 'SELECT last_pulled_version, last_pulled_at FROM sync_state WHERE id = \'default\'',
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as Array<{ last_pulled_version: number, last_pulled_at: string | null }>
      const row = rows[0]
      respond({
        id,
        ok: true,
        data: {
          lastPulledVersion: Number(row?.last_pulled_version ?? 0),
          lastPulledAt: row?.last_pulled_at || null,
        },
      })
      return
    }

    if (type === 'APPLY_REMOTE_CHANGES') {
      await dbReadyPromise
      const changes = payload?.changes || []
      const latestVersion = Number(payload?.latestVersion ?? 0)

      sqliteDb.exec('BEGIN TRANSACTION;')
      try {
        const result = await applyRemoteChangesOps(
          createSqliteDriver(),
          changes,
          latestVersion,
          (patch) => {
            tenantMeta = { ...tenantMeta, ...patch }
          },
        )
        sqliteDb.exec('COMMIT;')
        respond({ id, ok: true, data: result })
      }
      catch (err) {
        sqliteDb.exec('ROLLBACK;')
        throw err
      }
      return
    }

    if (type === 'UPDATE_SYNC_STATE') {
      await dbReadyPromise
      const now = new Date().toISOString()
      const sets: string[] = ['updated_at = ?']
      const binds: any[] = [now]
      if (payload?.status !== undefined) {
        sets.push('status = ?')
        binds.push(payload.status)
      }
      if (payload?.lastError !== undefined) {
        sets.push('last_error = ?')
        binds.push(payload.lastError)
      }
      if (payload?.tenantId !== undefined) {
        sets.push('tenant_id = ?')
        binds.push(payload.tenantId)
      }
      if (payload?.cloudUrl !== undefined) {
        sets.push('cloud_url = ?')
        binds.push(payload.cloudUrl)
      }
      if (payload?.cloudToken !== undefined) {
        sets.push('cloud_token = ?')
        binds.push(payload.cloudToken)
      }
      if (payload?.lastPulledVersion !== undefined) {
        sets.push('last_pulled_version = ?')
        binds.push(Number(payload.lastPulledVersion))
      }
      if (payload?.lastPulledAt !== undefined) {
        sets.push('last_pulled_at = ?')
        binds.push(payload.lastPulledAt)
      }
      if (payload?.lastPushedAt !== undefined) {
        sets.push('last_pushed_at = ?')
        binds.push(payload.lastPushedAt)
      }
      if (payload?.needsReconcile !== undefined) {
        sets.push('needs_reconcile = ?')
        binds.push(payload.needsReconcile ? 1 : 0)
      }
      if (payload?.ownerUid !== undefined) {
        sets.push('owner_uid = ?')
        binds.push(payload.ownerUid)
      }
      binds.push('default')
      sqliteDb.exec({
        sql: `UPDATE sync_state SET ${sets.join(', ')} WHERE id = ?`,
        bind: binds,
      })
      respond({ id, ok: true, data: { success: true } })
      return
    }

    if (type === 'MARK_SNAPSHOT_EXPORTED') {
      await dbReadyPromise
      const now = new Date().toISOString()
      const baseVersion = Number(payload?.baseVersion ?? 0)
      sqliteDb.exec('BEGIN TRANSACTION;')
      try {
        sqliteDb.exec('DELETE FROM outbox_mutations;')
        sqliteDb.exec({
          sql: `UPDATE sync_state SET last_pulled_version = ?, last_pushed_at = ?, status = 'synced', last_error = NULL, updated_at = ? WHERE id = 'default'`,
          bind: [baseVersion, now, now],
        })
        sqliteDb.exec('COMMIT;')
        respond({ id, ok: true, data: { success: true } })
      }
      catch (err) {
        sqliteDb.exec('ROLLBACK;')
        throw err
      }
      return
    }

    if (type === 'SET_DEVICE_ID') {
      await dbReadyPromise
      const newDeviceId = String(payload?.deviceId || '').trim()
      if (newDeviceId) {
        tenantMeta = { ...tenantMeta, deviceId: newDeviceId }
        sqliteDb.exec({
          sql: `UPDATE farm_settings SET device_id = ? WHERE id = 'default'`,
          bind: [newDeviceId],
        })
      }
      respond({ id, ok: true, data: { deviceId: tenantMeta.deviceId } })
      return
    }

    if (type === 'RAW_QUERY') {
      await dbReadyPromise
      const rows = sqliteDb.exec({
        sql: payload.sql,
        bind: payload.bind || [],
        rowMode: 'object',
        returnValue: 'resultRows',
      })
      respond({ id, ok: true, data: rows })
      return
    }

    throw new Error(`Unsupported worker message type: ${type}`)
  }
  catch (err: any) {
    if (err instanceof CoreApiError) {
      respond({
        id,
        ok: false,
        error: {
          statusCode: err.statusCode,
          statusMessage: err.statusMessage,
          ...err.data,
        },
      })
      return
    }

    const statusCode = err?.statusCode || 500
    const code = err?.data?.code || err?.code || 'internal'
    const fields = err?.data?.fields || err?.fields
    const reason = err?.data?.reason || err?.reason

    respond({
      id,
      ok: false,
      error: {
        statusCode,
        statusMessage: err?.message || 'Internal Error',
        code,
        ...(fields ? { fields } : {}),
        ...(reason ? { reason } : {}),
        ...(err?.data ? err.data : {}),
      },
    })
  }
}
