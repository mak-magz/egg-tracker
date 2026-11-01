import { randomUUID } from 'node:crypto'
import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import * as controlSchema from '../db/schema/control'
import { getControlDb, initControlDbSchema, initTenantDbSchema } from '../db/turso'

export interface ProvisionTenantParams {
  farmName: string
  currency?: string
  eggsPerTray?: number
  ownerEmail: string
  ownerUid: string
}

export interface ProvisionTenantResult {
  tenantId: string
  dbUrl: string
}

async function createTenantTursoDatabase(tenantId: string): Promise<{ dbUrl: string, dbAuthToken: string }> {
  const tursoApiToken = process.env.TURSO_API_TOKEN?.trim()
  const tursoOrg = process.env.TURSO_ORG?.trim()
  const tursoGroup = process.env.TURSO_GROUP?.trim() || 'default'

  if (!tursoApiToken || !tursoOrg) {
    return { dbUrl: `file:local-tenant-${tenantId}.db`, dbAuthToken: '' }
  }

  const dbName = `tamago-${tenantId.replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 32)}`
  const createRes = await fetch(`https://api.turso.tech/v1/organizations/${tursoOrg}/databases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tursoApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: dbName, group: tursoGroup }),
  })

  if (!createRes.ok) {
    const body = await createRes.text()
    throw new Error(`Couldn't create Turso database ${dbName}: ${createRes.status} ${body}`)
  }

  const createJson = (await createRes.json()) as { database?: { Hostname?: string } }
  const hostname = createJson.database?.Hostname
  if (!hostname) throw new Error('Turso API did not return a database Hostname.')

  const tokenRes = await fetch(
    `https://api.turso.tech/v1/organizations/${tursoOrg}/databases/${dbName}/auth/tokens`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tursoApiToken}` },
    },
  )

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    throw new Error(`Couldn't mint Turso database token for ${dbName}: ${tokenRes.status} ${body}`)
  }

  const tokenJson = (await tokenRes.json()) as { jwt?: string }
  if (!tokenJson.jwt) throw new Error('Turso API did not return a database JWT.')

  return { dbUrl: `libsql://${hostname}`, dbAuthToken: tokenJson.jwt }
}

export async function provisionTenantFarm(params: ProvisionTenantParams): Promise<ProvisionTenantResult> {
  const controlUrl = process.env.NUXT_TURSO_CONTROL_URL?.trim() || 'file:local-control.db'
  const controlToken = process.env.NUXT_TURSO_CONTROL_AUTH_TOKEN?.trim() || undefined
  const rawControlClient = createClient({ url: controlUrl, authToken: controlToken })
  await initControlDbSchema(rawControlClient)

  const controlDb = getControlDb()

  // 1. Check if user is already associated with a farm in Control DB
  const [existingMembership] = await controlDb
    .select()
    .from(controlSchema.memberships)
    .where(eq(controlSchema.memberships.userId, params.ownerUid))

  if (existingMembership) {
    const [existingTenant] = await controlDb
      .select()
      .from(controlSchema.tenants)
      .where(eq(controlSchema.tenants.id, existingMembership.tenantId))
    if (existingTenant) {
      return { tenantId: existingTenant.id, dbUrl: existingTenant.dbUrl }
    }
  }

  // 2. Create isolated Turso / local database for tenant
  const tenantId = randomUUID()
  const { dbUrl, dbAuthToken } = await createTenantTursoDatabase(tenantId)
  const now = new Date().toISOString()
  const farmName = params.farmName.trim()
  const currency = params.currency || 'PHP'
  const eggsPerTray = params.eggsPerTray ?? 30

  // 3. Register tenant in Control DB
  await controlDb.insert(controlSchema.tenants).values({
    id: tenantId,
    name: farmName,
    eggsPerTray,
    currency,
    dbUrl,
    dbAuthToken,
    createdAt: now,
    updatedAt: now,
  })

  // 4. Register owner membership in Control DB
  await controlDb.insert(controlSchema.memberships).values({
    id: randomUUID(),
    tenantId,
    userId: params.ownerUid,
    createdAt: now,
    updatedAt: now,
  })

  // 5. Initialize tenant DB schema and bootstrap tables
  const rawTenantClient = createClient({ url: dbUrl, authToken: dbAuthToken || undefined })
  await initTenantDbSchema(rawTenantClient)

  // 6. Bootstrap offline sync & settings tables in tenant database
  await rawTenantClient.batch([
    `CREATE TABLE IF NOT EXISTS farm_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      name TEXT NOT NULL DEFAULT 'My Egg Farm',
      eggs_per_tray INTEGER NOT NULL DEFAULT 30,
      currency TEXT NOT NULL DEFAULT 'PHP',
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS local_counters (
      id TEXT PRIMARY KEY,
      next_number INTEGER NOT NULL DEFAULT 1,
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
    {
      sql: `INSERT OR REPLACE INTO farm_settings (id, name, eggs_per_tray, currency, device_id, created_at, updated_at) VALUES ('default', ?, ?, ?, 'CLOUD', ?, ?)`,
      args: [farmName, eggsPerTray, currency, now, now],
    },
    {
      sql: `INSERT OR IGNORE INTO local_counters (id, next_number, updated_at) VALUES ('sales', 1, ?), ('orders', 1, ?)`,
      args: [now, now],
    },
  ], 'write')

  return { tenantId, dbUrl }
}
