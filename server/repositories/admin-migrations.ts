import { eq } from 'drizzle-orm'
import {
  TENANT_SCHEMA_USER_VERSION,
  ensureControlDbBootstrapped,
  getControlDb,
  getTenantLibsqlClient,
  initTenantDbSchema,
} from '../db/turso'
import * as controlSchema from '../db/schema/control'
import { recordAdminAuditLog } from './admin-audit'
import { apiError } from '../utils/errors'
import { mapWithConcurrency } from '../utils/concurrency'

export const SYSTEM_SCHEMA_VERSION = `v${TENANT_SCHEMA_USER_VERSION}`

function toSafeMigrationError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : ''
  const sanitized = raw
    .replace(/(?:libsql|wss?|https?):\/\/\S+/gi, '[redacted-url]')
    .replace(/file:\S+/gi, '[redacted-path]')
    .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
    .trim()
  if (sanitized) return sanitized.slice(0, 200)
  const code = (err as { code?: string })?.code
  return code ? `${fallback} (${code})` : fallback
}

export async function getFleetMigrationStatus() {
  await ensureControlDbBootstrapped()
  const controlDb = getControlDb()
  const tenants = await controlDb.select().from(controlSchema.tenants)

  let upToDate = 0
  let pending = 0
  let errorCount = 0

  const tenantStatuses = await mapWithConcurrency(tenants, 5, async (t) => {
    try {
      const client = getTenantLibsqlClient(t.dbUrl, t.dbAuthToken || undefined)
      const res = await client.execute('PRAGMA user_version')
      const currentVersionNum = Number(res.rows[0]?.user_version ?? 0)

      if (currentVersionNum >= TENANT_SCHEMA_USER_VERSION) {
        upToDate++
        return {
          tenantId: t.id,
          farmName: t.name,
          currentVersion: SYSTEM_SCHEMA_VERSION,
          status: 'up_to_date' as const,
        }
      }
      else if (currentVersionNum === 0) {
        pending++
        return {
          tenantId: t.id,
          farmName: t.name,
          currentVersion: 'pending_bootstrap',
          status: 'pending' as const,
        }
      }
      else {
        pending++
        return {
          tenantId: t.id,
          farmName: t.name,
          currentVersion: `v${currentVersionNum}`,
          status: 'pending' as const,
        }
      }
    }
    catch (e) {
      errorCount++
      return {
        tenantId: t.id,
        farmName: t.name,
        currentVersion: 'unknown',
        status: 'error' as const,
        lastError: toSafeMigrationError(e, 'Migration status error'),
      }
    }
  })

  return {
    systemVersion: SYSTEM_SCHEMA_VERSION,
    fleetSummary: {
      total: tenants.length,
      upToDate,
      pending,
      error: errorCount,
    },
    tenants: tenantStatuses,
  }
}

export async function runSingleTenantMigration(tenantId: string, operatorEmail: string) {
  const controlDb = getControlDb()
  const [tenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  if (!tenant) throw apiError(404, 'not_found')

  try {
    const client = getTenantLibsqlClient(tenant.dbUrl, tenant.dbAuthToken || undefined)
    await initTenantDbSchema(client)

    await recordAdminAuditLog({
      operatorEmail,
      actionType: 'schema_migration',
      targetId: tenantId,
      summary: `Migrated schema for ${tenant.name} to ${SYSTEM_SCHEMA_VERSION}`,
    })

    return { success: true, tenantId, version: SYSTEM_SCHEMA_VERSION }
  }
  catch (e) {
    return {
      success: false,
      tenantId,
      version: SYSTEM_SCHEMA_VERSION,
      error: toSafeMigrationError(e, 'Migration failed'),
    }
  }
}

export async function runBatchMigrations(targetTenantIds: string[] | undefined, operatorEmail: string) {
  const controlDb = getControlDb()
  let tenants = await controlDb.select().from(controlSchema.tenants)

  if (targetTenantIds && targetTenantIds.length > 0) {
    const set = new Set(targetTenantIds)
    tenants = tenants.filter(t => set.has(t.id))
  }

  let successful = 0
  let failed = 0

  const results = await mapWithConcurrency(tenants, 5, async (t) => {
    try {
      const client = getTenantLibsqlClient(t.dbUrl, t.dbAuthToken || undefined)
      await initTenantDbSchema(client)
      successful++
      return {
        tenantId: t.id,
        farmName: t.name,
        success: true,
        version: SYSTEM_SCHEMA_VERSION,
      }
    }
    catch (e) {
      failed++
      return {
        tenantId: t.id,
        farmName: t.name,
        success: false,
        version: SYSTEM_SCHEMA_VERSION,
        error: toSafeMigrationError(e, 'Migration failed'),
      }
    }
  })

  await recordAdminAuditLog({
    operatorEmail,
    actionType: 'schema_migration',
    targetId: 'fleet',
    summary: `Ran fleet migration: ${successful} succeeded, ${failed} failed`,
  })

  return {
    totalMigrated: tenants.length,
    successful,
    failed,
    results,
  }
}
