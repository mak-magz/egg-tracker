import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { ensureControlDbBootstrapped, getControlDb, initTenantDbSchema } from '../db/turso'
import * as controlSchema from '../db/schema/control'
import { recordAdminAuditLog } from './admin-audit'
import { apiError } from '../utils/errors'

export const SYSTEM_SCHEMA_VERSION = 'v1.0.0-full-schema'

export async function getFleetMigrationStatus() {
  await ensureControlDbBootstrapped()
  const controlDb = getControlDb()
  const tenants = await controlDb.select().from(controlSchema.tenants)

  let upToDate = 0
  let pending = 0
  let errorCount = 0

  const tenantStatuses = await Promise.all(
    tenants.map(async (t) => {
      try {
        const client = createClient({
          url: t.dbUrl,
          authToken: t.dbAuthToken || undefined,
        })
        const res = await client.execute('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'farm_settings\'')
        const exists = res.rows.length > 0
        if (exists) {
          upToDate++
          return {
            tenantId: t.id,
            farmName: t.name,
            currentVersion: SYSTEM_SCHEMA_VERSION,
            status: 'up_to_date' as const,
          }
        }
        else {
          pending++
          return {
            tenantId: t.id,
            farmName: t.name,
            currentVersion: 'pending_bootstrap',
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
          lastError: (e as Error).message,
        }
      }
    }),
  )

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
    const client = createClient({
      url: tenant.dbUrl,
      authToken: tenant.dbAuthToken || undefined,
    })
    await initTenantDbSchema(client)

    await recordAdminAuditLog({
      operatorEmail,
      actionType: 'schema_migration',
      targetId: tenantId,
      summary: `Migrated schema for ${tenant.name}`,
    })

    return { success: true, tenantId, version: SYSTEM_SCHEMA_VERSION }
  }
  catch (e) {
    return {
      success: false,
      tenantId,
      version: SYSTEM_SCHEMA_VERSION,
      error: (e as Error).message,
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
  const results = []

  // AC24/AC25: Sequential execution with isolated failure handling
  for (const t of tenants) {
    try {
      const client = createClient({
        url: t.dbUrl,
        authToken: t.dbAuthToken || undefined,
      })
      await initTenantDbSchema(client)
      successful++
      results.push({
        tenantId: t.id,
        farmName: t.name,
        success: true,
        version: SYSTEM_SCHEMA_VERSION,
      })
    }
    catch (e) {
      failed++
      results.push({
        tenantId: t.id,
        farmName: t.name,
        success: false,
        version: SYSTEM_SCHEMA_VERSION,
        error: (e as Error).message,
      })
    }
  }

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
