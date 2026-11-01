/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference lib="webworker" />

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
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
import type { ApiErrorData } from '#shared/types/api'

export interface WorkerRequest<T = any> {
  id: string
  type: 'EXECUTE' | 'PING' | 'EXPORT_DATA' | 'IMPORT_SNAPSHOT' | 'GET_SYNC_STATUS' | 'RAW_QUERY'
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
    updated_at TEXT NOT NULL
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
  `CREATE INDEX IF NOT EXISTS change_log_version_idx ON change_log (version);`,
]

async function initDatabase(): Promise<void> {
  const sqlite3 = await sqlite3InitModule()
  if ('opfs' in sqlite3) {
    try {
      sqliteDb = new sqlite3.oo1.OpfsDb('/farm.sqlite3')
    }
    catch (err) {
      console.warn('[worker] OPFS storage unavailable, falling back to memory database:', err)
      sqliteDb = new sqlite3.oo1.DB('/farm.sqlite3', 'ct')
    }
  }
  else {
    sqliteDb = new sqlite3.oo1.DB('/farm.sqlite3', 'ct')
  }

  // Execute DDL
  for (const ddl of TABLE_DEFINITIONS) {
    sqliteDb.exec(ddl)
  }

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
    sqliteDb.exec({
      sql: `INSERT INTO farm_settings (id, farm_name, eggs_per_tray, currency, device_id, onboarding_completed, created_at, updated_at) VALUES ('default', 'My Farm', 30, 'PHP', 'D1', 0, ?, ?)`,
      bind: [now, now],
    })
    tenantMeta = {
      tenantId: 'local-farm',
      name: 'My Farm',
      eggsPerTray: 30,
      currency: 'PHP',
      deviceId: 'D1',
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
      sql: 'SELECT farm_name, eggs_per_tray, currency, device_id, onboarding_completed FROM farm_settings WHERE id = ?',
      bind: ['default'],
      rowMode: 'object',
      returnValue: 'resultRows',
    }) as Array<{ farm_name: string, eggs_per_tray: number, currency: string, device_id: string, onboarding_completed: number }>

    const farmRow = farmRows[0] || {
      farm_name: 'My Farm',
      eggs_per_tray: 30,
      currency: 'PHP',
      device_id: 'D1',
      onboarding_completed: 0,
    }
    const sizes = await listSizes(tenantDb)
    return {
      email: '',
      farm: {
        id: 'local-farm',
        name: farmRow.farm_name,
        eggsPerTray: Number(farmRow.eggs_per_tray),
        currency: farmRow.currency,
        deviceId: farmRow.device_id,
        onboardingCompleted: Boolean(farmRow.onboarding_completed),
        isFree: true,
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
        isFree: true,
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
    await recordOutboxMutation('add_size', body)
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
    const result = await renameSize(tenantDb, id, name)
    await recordOutboxMutation('rename_size', { id, name })
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
    await recordOutboxMutation('add_client', body)
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
    await recordOutboxMutation('create_sale', body)
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
    await recordOutboxMutation('create_order', body)
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
    await recordOutboxMutation('deliver_order', { id, ...body })
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
    sales: sqliteDb.exec({ sql: 'SELECT * FROM sales', rowMode: 'object', returnValue: 'resultRows' }),
    saleLines: sqliteDb.exec({ sql: 'SELECT * FROM sale_lines', rowMode: 'object', returnValue: 'resultRows' }),
    orders: sqliteDb.exec({ sql: 'SELECT * FROM orders', rowMode: 'object', returnValue: 'resultRows' }),
    orderLines: sqliteDb.exec({ sql: 'SELECT * FROM order_lines', rowMode: 'object', returnValue: 'resultRows' }),
  }
}

async function importFullSnapshot(snapshot: any) {
  await dbReadyPromise
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

    for (const fs of snapshot.farmSettings || []) {
      sqliteDb.exec({
        sql: `INSERT INTO farm_settings (id, farm_name, eggs_per_tray, currency, device_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        bind: [fs.id, fs.farm_name ?? fs.farmName, fs.eggs_per_tray ?? fs.eggsPerTray, fs.currency, fs.device_id ?? fs.deviceId, fs.created_at ?? fs.createdAt, fs.updated_at ?? fs.updatedAt],
      })
    }

    for (const lc of snapshot.localCounters || []) {
      sqliteDb.exec({
        sql: `INSERT INTO local_counters (id, next_number, updated_at) VALUES (?, ?, ?)`,
        bind: [lc.id, lc.next_number ?? lc.nextNumber, lc.updated_at ?? lc.updatedAt],
      })
    }

    for (const s of snapshot.sizes || []) {
      sqliteDb.exec({
        sql: `INSERT INTO sizes (id, name, sort_order, color_slot, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        bind: [s.id, s.name, s.sort_order ?? s.sortOrder, s.color_slot ?? s.colorSlot, s.archived_at ?? s.archivedAt ?? null, s.created_at ?? s.createdAt, s.updated_at ?? s.updatedAt],
      })
    }

    for (const c of snapshot.clients || []) {
      sqliteDb.exec({
        sql: `INSERT INTO clients (id, name, phone, default_price, archived_at, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [c.id, c.name, c.phone ?? null, c.default_price ?? c.defaultPrice ?? null, c.archived_at ?? c.archivedAt ?? null, c.version ?? 1, c.created_at ?? c.createdAt, c.updated_at ?? c.updatedAt],
      })
    }

    for (const p of snapshot.production || []) {
      sqliteDb.exec({
        sql: `INSERT INTO production (id, produced_on, size_id, quality, eggs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        bind: [p.id, p.produced_on ?? p.producedOn, p.size_id ?? p.sizeId ?? null, p.quality, p.eggs, p.created_at ?? p.createdAt, p.updated_at ?? p.updatedAt],
      })
    }

    for (const s of snapshot.sales || []) {
      sqliteDb.exec({
        sql: `INSERT INTO sales (id, sale_number, client_id, type, sale_date, order_id, order_number, version, voided_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [s.id, s.sale_number ?? s.saleNumber, s.client_id ?? s.clientId ?? null, s.type, s.sale_date ?? s.saleDate, s.order_id ?? s.orderId ?? null, s.order_number ?? s.orderNumber ?? null, s.version ?? 1, s.voided_at ?? s.voidedAt ?? null, s.created_at ?? s.createdAt, s.updated_at ?? s.updatedAt],
      })
    }

    for (const sl of snapshot.saleLines || []) {
      sqliteDb.exec({
        sql: `INSERT INTO sale_lines (sale_id, size_id, eggs, price_per_tray, line_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        bind: [sl.sale_id ?? sl.saleId, sl.size_id ?? sl.sizeId, sl.eggs, sl.price_per_tray ?? sl.pricePerTray, sl.line_total ?? sl.lineTotal, sl.created_at ?? sl.createdAt, sl.updated_at ?? sl.updatedAt],
      })
    }

    for (const o of snapshot.orders || []) {
      sqliteDb.exec({
        sql: `INSERT INTO orders (id, order_number, client_id, order_date, wanted_by, status, cancelled_at, closed_short_at, converted_from_sale_number, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [o.id, o.order_number ?? o.orderNumber, o.client_id ?? o.clientId, o.order_date ?? o.orderDate, o.wanted_by ?? o.wantedBy ?? null, o.status, o.cancelled_at ?? o.cancelledAt ?? null, o.closed_short_at ?? o.closedShortAt ?? null, o.converted_from_sale_number ?? o.convertedFromSaleNumber ?? null, o.version ?? 1, o.created_at ?? o.createdAt, o.updated_at ?? o.updatedAt],
      })
    }

    for (const ol of snapshot.orderLines || []) {
      sqliteDb.exec({
        sql: `INSERT INTO order_lines (order_id, size_id, eggs, price_per_tray, line_total, dropped_eggs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [ol.order_id ?? ol.orderId, ol.size_id ?? ol.sizeId, ol.eggs, ol.price_per_tray ?? ol.pricePerTray, ol.line_total ?? ol.lineTotal, ol.dropped_eggs ?? ol.droppedEggs ?? 0, ol.created_at ?? ol.createdAt, ol.updated_at ?? ol.updatedAt],
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
      await importFullSnapshot(payload)
      respond({ id, ok: true, data: { success: true } })
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
        sql: 'SELECT COUNT(*) as count FROM outbox_mutations WHERE status = ?',
        bind: ['pending'],
        rowMode: 'object',
        returnValue: 'resultRows',
      })
      respond({
        id,
        ok: true,
        data: {
          syncState: syncRows[0] || null,
          pendingOutboxCount: Number(outboxCountRows[0]?.count ?? 0),
        },
      })
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
