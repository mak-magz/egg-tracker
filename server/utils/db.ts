// Tenant-scoped repository foundation (docs/features/00-project-scaffold.md §3.4, D3).
// Each tenant's data lives in its own isolated Turso/libSQL database (database-per-tenant),
// accessed via Drizzle ORM (`createDrizzleBackedClient`). On top of database-per-tenant isolation,
// every scoped query injects `tenant_id` here, so a forgotten filter returns nothing instead of leaking.
// Only server/repositories/ should touch `TenantDb.client`; routes call repositories.
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { createDrizzleBackedClient } from '../db/adapter'
import * as controlSchema from '../db/schema/control'
import { ensureControlDbBootstrapped, ensureTenantDbBootstrapped, getControlDb, getTenantDrizzleDb, resolveLibsqlUrl } from '../db/turso'
import { apiError } from './errors'
import { createTenantDbFromClient } from '../../core/db/tenant-db'
import type { TenantClient, TenantDb } from '../../core/db/tenant-db'

export * from '../../core/db/tenant-db'

export async function updateControlTenantRecord(
  tenantId: string,
  updates: Partial<{
    name: string
    eggsPerTray: number
    currency: string
    tier: 'free' | 'premium'
    updatedAt: string
  }>,
): Promise<void> {
  const controlDb = getControlDb()
  await controlDb.update(controlSchema.tenants).set(updates).where(eq(controlSchema.tenants.id, tenantId))
}

/** The tenant-scoped DB for this request. `tenantId` must come from requireTenant(), never from input. */
export async function createTenantDb(_event: H3Event, tenantId: string): Promise<TenantDb> {
  await ensureControlDbBootstrapped()
  const controlDb = getControlDb()
  const [tenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  if (!tenant) {
    throw apiError(403, 'no_farm')
  }

  const resolvedUrl = resolveLibsqlUrl(tenant.dbUrl)
  if (resolvedUrl.startsWith('file:')) {
    await ensureTenantDbBootstrapped(resolvedUrl, tenant.dbAuthToken || undefined)
  }

  const tenantDrizzle = getTenantDrizzleDb(resolvedUrl, tenant.dbAuthToken || undefined)
  const drizzleClient = createDrizzleBackedClient(tenantDrizzle, {
    tenantId: tenant.id,
    name: tenant.name,
    eggsPerTray: tenant.eggsPerTray,
    currency: tenant.currency,
  }) as unknown as TenantClient
  return createTenantDbFromClient(drizzleClient, tenantId)
}
