import { createClient } from '@libsql/client'

export interface TursoOrganizationMetrics {
  status: 'operational' | 'degraded' | 'down'
  activeDatabases: number
  maxDatabases: number
  totalBytesUsed: number
  maxBytesAllowed: number
  region: string
  isLocalDev: boolean
}

export interface TursoDatabaseSummary {
  name: string
  hostname: string
  status: string
  region: string
  bytesUsed?: number
}

export async function getTursoOrganizationMetrics(): Promise<TursoOrganizationMetrics> {
  const tursoApiToken = process.env.TURSO_API_TOKEN?.trim()
  const tursoOrg = process.env.TURSO_ORG?.trim()
  const isLocal = !tursoApiToken || !tursoOrg || (process.env.NUXT_TURSO_CONTROL_URL || '').startsWith('file:')

  if (isLocal) {
    return {
      status: 'operational',
      activeDatabases: 1,
      maxDatabases: 500,
      totalBytesUsed: 1024 * 1024 * 4, // 4 MB mock
      maxBytesAllowed: 1024 * 1024 * 1024 * 9, // 9 GB default cap
      region: 'local',
      isLocalDev: true,
    }
  }

  try {
    const res = await fetch(`https://api.turso.tech/v1/organizations/${tursoOrg}/databases`, {
      headers: { Authorization: `Bearer ${tursoApiToken}` },
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) {
      return {
        status: 'degraded',
        activeDatabases: 0,
        maxDatabases: 500,
        totalBytesUsed: 0,
        maxBytesAllowed: 1024 * 1024 * 1024 * 9,
        region: 'unknown',
        isLocalDev: false,
      }
    }

    const data = await res.json() as { databases?: Array<{ Name: string, primary_region?: string, total_size?: number }> }
    const databases = data.databases || []
    const totalBytes = databases.reduce((acc, db) => acc + (db.total_size || 0), 0)
    const primaryRegion = databases[0]?.primary_region || 'sin'

    return {
      status: 'operational',
      activeDatabases: databases.length,
      maxDatabases: 500,
      totalBytesUsed: totalBytes || 1024 * 1024 * 12,
      maxBytesAllowed: 1024 * 1024 * 1024 * 9,
      region: primaryRegion,
      isLocalDev: false,
    }
  }
  catch {
    return {
      status: 'degraded',
      activeDatabases: 0,
      maxDatabases: 500,
      totalBytesUsed: 0,
      maxBytesAllowed: 1024 * 1024 * 1024 * 9,
      region: 'unknown',
      isLocalDev: false,
    }
  }
}

export async function createTenantTursoDatabase(tenantId: string): Promise<{ dbUrl: string, dbAuthToken: string }> {
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

export async function deleteTenantTursoDatabase(tenantId: string): Promise<boolean> {
  const tursoApiToken = process.env.TURSO_API_TOKEN?.trim()
  const tursoOrg = process.env.TURSO_ORG?.trim()

  if (!tursoApiToken || !tursoOrg) return true

  const dbName = `tamago-${tenantId.replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 32)}`
  try {
    const res = await fetch(`https://api.turso.tech/v1/organizations/${tursoOrg}/databases/${dbName}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tursoApiToken}` },
    })
    return res.ok
  }
  catch {
    return false
  }
}

export async function testDatabasePing(dbUrl: string, dbAuthToken?: string): Promise<{ connected: boolean, latencyMs: number, error?: string }> {
  const start = performance.now()
  try {
    const client = createClient({
      url: dbUrl,
      authToken: dbAuthToken || undefined,
    })
    await client.execute('SELECT 1 as ping')
    const latencyMs = Math.round(performance.now() - start)
    return { connected: true, latencyMs }
  }
  catch (e) {
    const latencyMs = Math.round(performance.now() - start)
    return {
      connected: false,
      latencyMs,
      error: (e as Error).message || 'Connection failure',
    }
  }
}
