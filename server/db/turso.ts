// Turso + Drizzle connection manager for Control DB and Database-per-Tenant DBs.
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import type { Client as LibSqlClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as controlSchema from './schema/control'
import * as tenantSchema from './schema/tenant'

export type ControlDrizzleDb = LibSQLDatabase<typeof controlSchema>
export type TenantDrizzleDb = LibSQLDatabase<typeof tenantSchema>

export const TENANT_SCHEMA_USER_VERSION = 3

let controlDbInstance: ControlDrizzleDb | null = null
let controlDbUrlCached: string | null = null
const tenantDbPool = new Map<string, TenantDrizzleDb>()
const tenantLibsqlPool = new Map<string, LibSqlClient>()
const tenantBootstrapPool = new Map<string, Promise<void>>()

let controlBootstrapPromise: Promise<void> | null = null

/**
 * Resolves a libSQL URL so relative `file:` paths on read-only serverless filesystems
 * (e.g. Vercel `/var/task`) are redirected to `os.tmpdir()` (`/tmp`).
 */
export function resolveLibsqlUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY)
  if (isServerless && trimmed.startsWith('file:')) {
    const filePath = trimmed.slice('file:'.length)
    // If relative path (not starting with / or drive letter)
    if (filePath && !filePath.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(filePath)) {
      const tmpPath = join(tmpdir(), filePath).replace(/\\/g, '/')
      return `file:${tmpPath}`
    }
  }
  return trimmed
}

export function getControlDbConfig(): { url: string, authToken: string | undefined } {
  const rawUrl = process.env.NUXT_TURSO_CONTROL_URL?.trim() || 'file:local-control.db'
  const url = resolveLibsqlUrl(rawUrl)
  const authToken = process.env.NUXT_TURSO_CONTROL_AUTH_TOKEN?.trim() || undefined
  return { url, authToken }
}

export function ensureControlDbBootstrapped(): Promise<void> {
  const { url, authToken } = getControlDbConfig()
  if (controlDbUrlCached !== url) {
    controlBootstrapPromise = null
    controlDbInstance = null
    controlDbUrlCached = url
  }
  if (!controlBootstrapPromise) {
    const client = createClient({ url, authToken })
    controlBootstrapPromise = initControlDbSchema(client).catch((err) => {
      controlBootstrapPromise = null
      throw err
    })
  }
  return controlBootstrapPromise
}

export function getControlDb(): ControlDrizzleDb {
  const { url, authToken } = getControlDbConfig()
  if (!controlDbInstance || controlDbUrlCached !== url) {
    const client = createClient({ url, authToken })
    controlDbInstance = drizzle(client, { schema: controlSchema })
    controlDbUrlCached = url
    ensureControlDbBootstrapped().catch(() => {})
  }
  return controlDbInstance
}

export function getTenantLibsqlClient(dbUrl: string, dbAuthToken?: string): LibSqlClient {
  const resolvedUrl = resolveLibsqlUrl(dbUrl)
  const key = `${resolvedUrl}::${dbAuthToken ?? ''}`
  let client = tenantLibsqlPool.get(key)
  if (!client) {
    client = createClient({
      url: resolvedUrl,
      authToken: dbAuthToken || undefined,
    })
    tenantLibsqlPool.set(key, client)
  }
  return client
}

export function ensureTenantDbBootstrapped(dbUrl: string, dbAuthToken?: string): Promise<void> {
  const resolvedUrl = resolveLibsqlUrl(dbUrl)
  const key = `${resolvedUrl}::${dbAuthToken ?? ''}`
  let promise = tenantBootstrapPool.get(key)
  if (!promise) {
    const client = getTenantLibsqlClient(resolvedUrl, dbAuthToken)
    promise = migrateTenantDatabase(client).catch((err) => {
      tenantBootstrapPool.delete(key)
      throw err
    })
    tenantBootstrapPool.set(key, promise)
  }
  return promise
}

export function getTenantDrizzleDb(dbUrl: string, dbAuthToken?: string): TenantDrizzleDb {
  const resolvedUrl = resolveLibsqlUrl(dbUrl)
  const key = `${resolvedUrl}::${dbAuthToken ?? ''}`
  let db = tenantDbPool.get(key)
  if (!db) {
    const client = getTenantLibsqlClient(resolvedUrl, dbAuthToken)
    db = drizzle(client, { schema: tenantSchema })
    tenantDbPool.set(key, db)
  }
  return db
}

async function withBatchRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    }
    catch (err) {
      lastErr = err
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 300 * attempt))
      }
    }
  }
  throw lastErr
}

/** Bootstraps the Control DB tables if they do not exist yet (ideal for local dev & initial provisioning). */
export async function initControlDbSchema(client: LibSqlClient): Promise<void> {
  await withBatchRetry(() => client.batch([
    `CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'free',
      eggs_per_tray INTEGER NOT NULL DEFAULT 30,
      currency TEXT NOT NULL DEFAULT 'PHP',
      db_url TEXT NOT NULL,
      db_auth_token TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      operator_email TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'superadmin',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS admins_user_id_key ON admins (user_id)`,
    `CREATE INDEX IF NOT EXISTS admins_email_idx ON admins (email)`,
    `CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON admin_audit_logs (created_at)`,
    `CREATE INDEX IF NOT EXISTS admin_audit_logs_operator_idx ON admin_audit_logs (operator_email)`,
  ], 'write'))

  try {
    await client.execute(`ALTER TABLE tenants ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'`)
  }
  catch {
    // Column already exists, safe to ignore
  }
}

async function readSchemaVersions(client: LibSqlClient): Promise<{ metaVersion: number, pragmaVersion: number }> {
  let metaVersion = 0
  try {
    const res = await client.execute('SELECT version FROM _schema_meta WHERE id = 1')
    const parsed = Number(res.rows[0]?.version ?? 0)
    if (Number.isFinite(parsed)) metaVersion = parsed
  }
  catch {
    metaVersion = 0
  }

  let pragmaVersion = 0
  try {
    const res = await client.execute('PRAGMA user_version')
    const parsed = Number(res.rows[0]?.user_version ?? 0)
    if (Number.isFinite(parsed)) pragmaVersion = parsed
  }
  catch {
    pragmaVersion = 0
  }

  return { metaVersion, pragmaVersion }
}

/**
 * Reads the schema version of a tenant database.
 * Supports both Turso Cloud (via `_schema_meta` table) and local SQLite (via `PRAGMA user_version`).
 */
export async function readTenantSchemaVersion(client: LibSqlClient): Promise<number> {
  const { metaVersion, pragmaVersion } = await readSchemaVersions(client)
  return Math.max(metaVersion, pragmaVersion)
}

/**
 * Records the schema version in `_schema_meta` and syncs `PRAGMA user_version` best-effort
 * (Turso Cloud keeps `PRAGMA user_version` read-only and rejects writes).
 */
async function writeTenantSchemaVersion(client: LibSqlClient, version: number, now: string): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  await client.execute({
    sql: `INSERT INTO _schema_meta (id, version, updated_at) VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at`,
    args: [version, now],
  })
  try {
    await client.execute(`PRAGMA user_version = ${Number(version)}`)
  }
  catch {
    // PRAGMA user_version is read-only on Turso Cloud
  }
}

/**
 * Executes idempotent versioned migrations on tenant databases:
 * v0 -> v1 (Baseline Core DDL & seeds)
 * v1 -> v2 (sizes.default_price & farm_settings.tier)
 * v2 -> v3 (sync_rejections, sync_state.needs_reconcile, outbox_status_idx)
 */
export async function migrateTenantDatabase(client: LibSqlClient): Promise<void> {
  const { metaVersion, pragmaVersion } = await readSchemaVersions(client)
  const currentVersion = Math.max(metaVersion, pragmaVersion)
  const now = new Date().toISOString()

  if (currentVersion >= TENANT_SCHEMA_USER_VERSION) {
    if (metaVersion < currentVersion) {
      await writeTenantSchemaVersion(client, currentVersion, now)
    }
    else if (pragmaVersion < currentVersion) {
      try {
        await client.execute(`PRAGMA user_version = ${currentVersion}`)
      }
      catch {
        // Ignored on Turso Cloud where PRAGMA user_version is read-only
      }
    }
    return
  }

  if (currentVersion < 1) {
    await withBatchRetry(() => client.batch([
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
      )`,
      `CREATE TABLE IF NOT EXISTS local_counters (
        id TEXT PRIMARY KEY,
        next_number INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sale_counters (
        id INTEGER PRIMARY KEY DEFAULT 1,
        next_number INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS order_counters (
        id INTEGER PRIMARY KEY DEFAULT 1,
        next_number INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sizes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        color_slot INTEGER NOT NULL UNIQUE,
        archived_at TEXT,
        default_price REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS size_submissions (
        id TEXT PRIMARY KEY,
        size_id TEXT NOT NULL REFERENCES sizes(id),
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS production (
        id TEXT PRIMARY KEY,
        produced_on TEXT NOT NULL,
        size_id TEXT REFERENCES sizes(id),
        quality TEXT NOT NULL,
        eggs INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS production_submissions (
        id TEXT PRIMARY KEY,
        produced_on TEXT NOT NULL,
        had_before INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        default_price REAL,
        archived_at TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS client_submissions (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES clients(id),
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
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
      )`,
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
      )`,
      `CREATE TABLE IF NOT EXISTS order_submissions (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
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
      )`,
      `CREATE TABLE IF NOT EXISTS sale_lines (
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        size_id TEXT NOT NULL REFERENCES sizes(id),
        eggs INTEGER NOT NULL,
        price_per_tray REAL NOT NULL,
        line_total REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (sale_id, size_id)
      )`,
      `CREATE TABLE IF NOT EXISTS sale_submissions (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS outbox_mutations (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        mutation_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at TEXT NOT NULL
      )`,
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
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS change_log (
        version INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        device_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        data TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS change_log_version_idx ON change_log (version)`,
      `CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox_mutations (status, created_at)`,
      {
        sql: `INSERT OR IGNORE INTO farm_settings (id, farm_name, eggs_per_tray, currency, device_id, tier, onboarding_completed, created_at, updated_at) VALUES ('default', 'My Farm', 30, 'PHP', 'CLOUD', 'premium', 1, ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT OR IGNORE INTO sale_counters (id, next_number, updated_at) VALUES (1, 1, ?)`,
        args: [now],
      },
      {
        sql: `INSERT OR IGNORE INTO order_counters (id, next_number, updated_at) VALUES (1, 1, ?)`,
        args: [now],
      },
      {
        sql: `INSERT OR IGNORE INTO local_counters (id, next_number, updated_at) VALUES ('sales', 1, ?), ('orders', 1, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT OR IGNORE INTO sync_state (id, status, updated_at) VALUES ('default', 'local_only', ?)`,
        args: [now],
      },
    ], 'write'))

    const existingSizes = await client.execute('SELECT COUNT(*) as c FROM sizes')
    const count = Number(existingSizes.rows[0]?.c ?? 0)
    if (count === 0) {
      const defaults = [
        { id: crypto.randomUUID(), name: 'Small', sortOrder: 0, colorSlot: 0 },
        { id: crypto.randomUUID(), name: 'Medium', sortOrder: 1, colorSlot: 1 },
        { id: crypto.randomUUID(), name: 'Large', sortOrder: 2, colorSlot: 2 },
        { id: crypto.randomUUID(), name: 'Jumbo', sortOrder: 3, colorSlot: 3 },
      ]
      await withBatchRetry(() => client.batch(
        defaults.map(d => ({
          sql: `INSERT OR IGNORE INTO sizes (id, name, sort_order, color_slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [d.id, d.name, d.sortOrder, d.colorSlot, now, now],
        })),
        'write',
      ))
    }
    await writeTenantSchemaVersion(client, 1, now)
  }

  if (currentVersion < 2) {
    const sizeInfo = await client.execute('PRAGMA table_info(sizes)')
    const hasDefaultPrice = sizeInfo.rows.some(r => String(r.name) === 'default_price')
    if (!hasDefaultPrice) {
      try {
        await client.execute('ALTER TABLE sizes ADD COLUMN default_price REAL')
      }
      catch {
        // Column already exists
      }
    }

    const farmInfo = await client.execute('PRAGMA table_info(farm_settings)')
    const hasTier = farmInfo.rows.some(r => String(r.name) === 'tier')
    if (!hasTier) {
      try {
        await client.execute('ALTER TABLE farm_settings ADD COLUMN tier TEXT NOT NULL DEFAULT \'free\'')
      }
      catch {
        // Column already exists
      }
    }
    await writeTenantSchemaVersion(client, 2, now)
  }

  if (currentVersion < 3) {
    await withBatchRetry(() => client.batch([
      `CREATE TABLE IF NOT EXISTS sync_rejections (
        id TEXT PRIMARY KEY,
        mutation_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        mutation_type TEXT NOT NULL,
        entity_ref TEXT NOT NULL,
        error_code TEXT NOT NULL,
        reason TEXT,
        error_message TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        rejected_at TEXT NOT NULL,
        resolved_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS sync_rejections_unresolved_idx ON sync_rejections (resolved_at, rejected_at)`,
      `CREATE INDEX IF NOT EXISTS sync_rejections_mutation_idx ON sync_rejections (mutation_id)`,
      `CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox_mutations (status, created_at)`,
    ], 'write'))

    const syncStateInfo = await client.execute('PRAGMA table_info(sync_state)')
    const hasNeedsReconcile = syncStateInfo.rows.some(r => String(r.name) === 'needs_reconcile')
    if (!hasNeedsReconcile) {
      try {
        await client.execute('ALTER TABLE sync_state ADD COLUMN needs_reconcile INTEGER NOT NULL DEFAULT 0')
      }
      catch {
        // Column already exists
      }
    }

    await writeTenantSchemaVersion(client, TENANT_SCHEMA_USER_VERSION, now)
  }
}

export async function initTenantDbSchema(client: LibSqlClient): Promise<void> {
  await migrateTenantDatabase(client)
}
