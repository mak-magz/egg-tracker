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
  tier?: 'free' | 'premium'
}

export interface ProvisionTenantResult {
  tenantId: string
  dbUrl: string
}

function isPlatformApiToken(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) return false
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    // Turso database tokens contain 'rid' (resource id) and/or 'a' (action permissions like rw).
    // Platform API tokens do not contain 'rid'.
    if (payload.rid || payload.a) return false
    return true
  }
  catch {
    return false
  }
}

async function createTenantTursoDatabase(tenantId: string): Promise<{ dbUrl: string, dbAuthToken: string }> {
  const tursoApiToken = process.env.TURSO_API_TOKEN?.trim()
  const tursoOrg = process.env.TURSO_ORG?.trim()
  const tursoGroup = process.env.TURSO_GROUP?.trim() || 'default'

  if (!tursoApiToken || !tursoOrg) {
    return { dbUrl: `file:local-tenant-${tenantId}.db`, dbAuthToken: '' }
  }

  if (!isPlatformApiToken(tursoApiToken)) {
    console.warn(
      `[provision] TURSO_API_TOKEN is a database token, not a Turso Platform API token. `
      + `Platform API tokens are minted via 'turso auth api-tokens mint <name>' or in the Turso Dashboard under Settings > API Tokens. `
      + `Falling back to local SQLite database in development.`,
    )
    if (process.env.NODE_ENV !== 'production') {
      return { dbUrl: `file:local-tenant-${tenantId}.db`, dbAuthToken: '' }
    }
    throw new Error('TURSO_API_TOKEN must be a Turso Platform API token, not a database auth token.')
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
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provision] Failed to create Turso database ${dbName} (${createRes.status} ${body}). Falling back to local tenant DB.`)
      return { dbUrl: `file:local-tenant-${tenantId}.db`, dbAuthToken: '' }
    }
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
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provision] Failed to mint Turso database token for ${dbName} (${tokenRes.status} ${body}). Falling back to local tenant DB.`)
      return { dbUrl: `file:local-tenant-${tenantId}.db`, dbAuthToken: '' }
    }
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
  const tier = params.tier || 'premium'

  // 3. Register tenant in Control DB
  await controlDb.insert(controlSchema.tenants).values({
    id: tenantId,
    name: farmName,
    tier,
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

  // 6. Bootstrap farm settings in tenant database
  await rawTenantClient.execute({
    sql: `INSERT OR REPLACE INTO farm_settings (id, farm_name, eggs_per_tray, currency, device_id, tier, onboarding_completed, created_at, updated_at) VALUES ('default', ?, ?, ?, 'CLOUD', ?, 1, ?, ?)`,
    args: [farmName, eggsPerTray, currency, tier, now, now],
  })

  return { tenantId, dbUrl }
}
