import { randomUUID } from 'node:crypto'
import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import * as controlSchema from '../db/schema/control'
import {
  ensureControlDbBootstrapped,
  ensureTenantDbBootstrapped,
  getControlDb,
  initTenantDbSchema,
  resolveLibsqlUrl,
} from '../db/turso'

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

export function isDatabaseAuthToken(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) return false
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    // Turso database tokens contain 'rid' (resource id) and/or 'a' (action permissions like rw).
    // Platform API tokens do not contain 'rid' or 'a'.
    return Boolean(payload.rid || payload.a)
  }
  catch {
    return false
  }
}

async function createTenantTursoDatabase(tenantId: string): Promise<{ dbUrl: string, dbAuthToken: string }> {
  const fallbackLocal = () => ({
    dbUrl: resolveLibsqlUrl(`file:local-tenant-${tenantId}.db`),
    dbAuthToken: '',
  })

  const tursoApiToken = process.env.TURSO_API_TOKEN?.trim()
  const tursoOrg = process.env.TURSO_ORG?.trim()
  let tursoGroup = process.env.TURSO_GROUP?.trim() || 'default'

  if (!tursoApiToken || !tursoOrg) {
    return fallbackLocal()
  }

  if (isDatabaseAuthToken(tursoApiToken)) {
    console.warn(
      `[provision] TURSO_API_TOKEN is a database token, not a Turso Platform API token. `
      + `Platform API tokens are minted via 'turso auth api-tokens mint <name>' or in the Turso Dashboard under Settings > API Tokens. `
      + `Falling back to local SQLite database.`,
    )
    return fallbackLocal()
  }

  const dbName = `tamago-${tenantId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 24)}`
  const requestCreateDb = (group: string) =>
    fetch(`https://api.turso.tech/v1/organizations/${tursoOrg}/databases`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tursoApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: dbName, group }),
    })

  let createRes = await requestCreateDb(tursoGroup)

  // If the configured group (e.g. 'default') does not exist in the Turso org, discover the first available group
  if (!createRes.ok && createRes.status !== 409) {
    try {
      const groupsRes = await fetch(`https://api.turso.tech/v1/organizations/${tursoOrg}/groups`, {
        headers: { Authorization: `Bearer ${tursoApiToken}` },
      })
      if (groupsRes.ok) {
        const groupsJson = (await groupsRes.json()) as { groups?: Array<{ name?: string }> }
        const firstGroup = groupsJson.groups?.[0]?.name
        if (firstGroup && firstGroup !== tursoGroup) {
          tursoGroup = firstGroup
          createRes = await requestCreateDb(tursoGroup)
        }
      }
    }
    catch {
      // Ignore group discovery error and handle original createRes below
    }
  }

  let hostname: string | undefined
  if (createRes.status === 409) {
    // Database already exists from an earlier attempt; fetch its hostname
    const getRes = await fetch(`https://api.turso.tech/v1/organizations/${tursoOrg}/databases/${dbName}`, {
      headers: { Authorization: `Bearer ${tursoApiToken}` },
    })
    if (getRes.ok) {
      const getJson = (await getRes.json()) as { database?: { Hostname?: string } }
      hostname = getJson.database?.Hostname
    }
  }
  else if (createRes.ok) {
    const createJson = (await createRes.json()) as { database?: { Hostname?: string } }
    hostname = createJson.database?.Hostname
  }
  else {
    const body = await createRes.text()
    console.warn(`[provision] Failed to create Turso database ${dbName} (${createRes.status} ${body}). Falling back to local tenant DB.`)
    return fallbackLocal()
  }

  if (!hostname) {
    console.warn(`[provision] Turso API did not return a database Hostname for ${dbName}. Falling back to local tenant DB.`)
    return fallbackLocal()
  }

  const tokenRes = await fetch(
    `https://api.turso.tech/v1/organizations/${tursoOrg}/databases/${dbName}/auth/tokens`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tursoApiToken}` },
    },
  )

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.warn(`[provision] Failed to mint Turso database token for ${dbName} (${tokenRes.status} ${body}). Falling back to local tenant DB.`)
    return fallbackLocal()
  }

  const tokenJson = (await tokenRes.json()) as { jwt?: string }
  if (!tokenJson.jwt) {
    console.warn(`[provision] Turso API did not return a database JWT for ${dbName}. Falling back to local tenant DB.`)
    return fallbackLocal()
  }

  return { dbUrl: `libsql://${hostname}`, dbAuthToken: tokenJson.jwt }
}

export async function provisionTenantFarm(params: ProvisionTenantParams): Promise<ProvisionTenantResult> {
  await ensureControlDbBootstrapped()
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
      const resolvedUrl = resolveLibsqlUrl(existingTenant.dbUrl)
      if (resolvedUrl !== existingTenant.dbUrl) {
        await controlDb
          .update(controlSchema.tenants)
          .set({ dbUrl: resolvedUrl, updatedAt: new Date().toISOString() })
          .where(eq(controlSchema.tenants.id, existingTenant.id))
      }
      await ensureTenantDbBootstrapped(resolvedUrl, existingTenant.dbAuthToken || undefined)
      return { tenantId: existingTenant.id, dbUrl: resolvedUrl }
    }
    // Remove orphaned membership row if tenant record was missing
    await controlDb
      .delete(controlSchema.memberships)
      .where(eq(controlSchema.memberships.id, existingMembership.id))
  }

  // 2. Create isolated Turso / local database for tenant
  const tenantId = randomUUID()
  const { dbUrl, dbAuthToken } = await createTenantTursoDatabase(tenantId)
  const now = new Date().toISOString()
  const farmName = params.farmName.trim()
  const currency = params.currency || 'PHP'
  const eggsPerTray = params.eggsPerTray ?? 30
  const tier = params.tier || 'premium'

  // 3. Initialize tenant DB schema and bootstrap tables BEFORE registering in Control DB
  // so a failed tenant DB initialization never leaves a broken tenant/membership record behind.
  const rawTenantClient = createClient({ url: dbUrl, authToken: dbAuthToken || undefined })
  await initTenantDbSchema(rawTenantClient)

  // 4. Bootstrap farm settings in tenant database
  await rawTenantClient.execute({
    sql: `INSERT OR REPLACE INTO farm_settings (id, farm_name, eggs_per_tray, currency, device_id, tier, onboarding_completed, created_at, updated_at) VALUES ('default', ?, ?, ?, 'CLOUD', ?, 1, ?, ?)`,
    args: [farmName, eggsPerTray, currency, tier, now, now],
  })

  // 5. Register tenant in Control DB
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

  // 6. Register owner membership in Control DB
  await controlDb.insert(controlSchema.memberships).values({
    id: randomUUID(),
    tenantId,
    userId: params.ownerUid,
    createdAt: now,
    updatedAt: now,
  })

  return { tenantId, dbUrl }
}
