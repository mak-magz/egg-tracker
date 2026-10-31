import { eq } from 'drizzle-orm'
import type { FarmSummary } from '../../shared/types/api'
import { getControlDb, getTenantDrizzleDb } from '../db/turso'
import * as controlSchema from '../db/schema/control'
import * as tenantSchema from '../db/schema/tenant'
import { RepositoryError } from '../utils/errors'
import { toFarmSummary } from './tenants'

export interface MembershipWithFarm {
  tenantId: string
  farm: FarmSummary
}

/**
 * The only query that runs BEFORE the tenant is known. Scoped by userId in the Turso Control DB,
 * and loads the farm's metadata and sizes from its dedicated Turso Tenant DB.
 * Returns null when the user has no membership (AC12). Throws on DB errors.
 */
export async function findMembershipWithFarm(
  userId: string,
): Promise<MembershipWithFarm | null> {
  try {
    const controlDb = getControlDb()
    const [membership] = await controlDb
      .select()
      .from(controlSchema.memberships)
      .where(eq(controlSchema.memberships.userId, userId))
    if (!membership) return null

    const [tenant] = await controlDb
      .select()
      .from(controlSchema.tenants)
      .where(eq(controlSchema.tenants.id, membership.tenantId))
    if (!tenant) {
      throw new Error('membership without a visible farm')
    }

    const tenantDb = getTenantDrizzleDb(tenant.dbUrl, tenant.dbAuthToken || undefined)
    const sizes = await tenantDb
      .select({
        id: tenantSchema.sizes.id,
        name: tenantSchema.sizes.name,
        sort_order: tenantSchema.sizes.sortOrder,
        color_slot: tenantSchema.sizes.colorSlot,
        archived_at: tenantSchema.sizes.archivedAt,
      })
      .from(tenantSchema.sizes)

    return {
      tenantId: tenant.id,
      farm: toFarmSummary({
        id: tenant.id,
        name: tenant.name,
        eggs_per_tray: tenant.eggsPerTray,
        currency: tenant.currency,
        sizes,
      }),
    }
  }
  catch (e) {
    if (e instanceof Error && e.message === 'membership without a visible farm') throw e
    const code = (e as { code?: string })?.code ?? 'XX000'
    throw new RepositoryError('membership lookup failed', code)
  }
}
