// Turso + Drizzle connection manager for Control DB and Database-per-Tenant DBs.
import { createClient } from '@libsql/client'
import type { Client as LibSqlClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as controlSchema from './schema/control'
import * as tenantSchema from './schema/tenant'

export type ControlDrizzleDb = LibSQLDatabase<typeof controlSchema>
export type TenantDrizzleDb = LibSQLDatabase<typeof tenantSchema>

let controlDbInstance: ControlDrizzleDb | null = null
const tenantDbPool = new Map<string, TenantDrizzleDb>()

let controlBootstrapPromise: Promise<void> | null = null

export function ensureControlDbBootstrapped(): Promise<void> {
  if (!controlBootstrapPromise) {
    const url = process.env.NUXT_TURSO_CONTROL_URL || 'file:local-control.db'
    const authToken = process.env.NUXT_TURSO_CONTROL_AUTH_TOKEN || undefined
    const client = createClient({ url, authToken })
    controlBootstrapPromise = initControlDbSchema(client)
  }
  return controlBootstrapPromise
}

export function getControlDb(): ControlDrizzleDb {
  if (!controlDbInstance) {
    const url = process.env.NUXT_TURSO_CONTROL_URL || 'file:local-control.db'
    const authToken = process.env.NUXT_TURSO_CONTROL_AUTH_TOKEN || undefined
    const client = createClient({ url, authToken })
    controlDbInstance = drizzle(client, { schema: controlSchema })
    if (url.startsWith('file:')) {
      ensureControlDbBootstrapped().catch(() => {})
    }
  }
  return controlDbInstance
}

export function getTenantDrizzleDb(dbUrl: string, dbAuthToken?: string): TenantDrizzleDb {
  const key = `${dbUrl}::${dbAuthToken ?? ''}`
  let db = tenantDbPool.get(key)
  if (!db) {
    const client = createClient({
      url: dbUrl,
      authToken: dbAuthToken || undefined,
    })
    db = drizzle(client, { schema: tenantSchema })
    tenantDbPool.set(key, db)
  }
  return db
}

/** Bootstraps the Control DB tables if they do not exist yet (ideal for local dev & initial provisioning). */
export async function initControlDbSchema(client: LibSqlClient): Promise<void> {
  await client.batch([
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
  ], 'write')

  // Backwards compatibility migration check: add tier column if table previously existed without it
  try {
    await client.execute(`ALTER TABLE tenants ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'`)
  }
  catch {
    // Column already exists, safe to ignore
  }
}

/** Bootstraps a newly created Tenant DB with the business tables and seeds default sizes & counters. */
export async function initTenantDbSchema(client: LibSqlClient): Promise<void> {
  const now = new Date().toISOString()
  await client.batch([
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
    `CREATE TABLE IF NOT EXISTS sizes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      color_slot INTEGER NOT NULL UNIQUE,
      archived_at TEXT,
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
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number INTEGER NOT NULL UNIQUE,
      client_id TEXT NOT NULL REFERENCES clients(id),
      order_date TEXT NOT NULL,
      wanted_by TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      cancelled_at TEXT,
      closed_short_at TEXT,
      converted_from_sale_number INTEGER,
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
      sale_number INTEGER NOT NULL UNIQUE,
      client_id TEXT REFERENCES clients(id),
      type TEXT NOT NULL,
      sale_date TEXT NOT NULL,
      order_id TEXT REFERENCES orders(id),
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
    {
      sql: `INSERT OR IGNORE INTO sale_counters (id, next_number, updated_at) VALUES (1, 1, ?)`,
      args: [now],
    },
    {
      sql: `INSERT OR IGNORE INTO order_counters (id, next_number, updated_at) VALUES (1, 1, ?)`,
      args: [now],
    },
  ], 'write')

  // Seed default sizes if none exist
  const existingSizes = await client.execute('SELECT COUNT(*) as c FROM sizes')
  const count = Number(existingSizes.rows[0]?.c ?? 0)
  if (count === 0) {
    const defaults = [
      { id: crypto.randomUUID(), name: 'Small', sortOrder: 0, colorSlot: 0 },
      { id: crypto.randomUUID(), name: 'Medium', sortOrder: 1, colorSlot: 1 },
      { id: crypto.randomUUID(), name: 'Large', sortOrder: 2, colorSlot: 2 },
      { id: crypto.randomUUID(), name: 'Jumbo', sortOrder: 3, colorSlot: 3 },
    ]
    await client.batch(
      defaults.map(d => ({
        sql: `INSERT INTO sizes (id, name, sort_order, color_slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [d.id, d.name, d.sortOrder, d.colorSlot, now, now],
      })),
      'write',
    )
  }
}
