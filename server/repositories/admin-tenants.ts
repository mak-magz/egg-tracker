import { eq } from 'drizzle-orm'
import { ensureControlDbBootstrapped, getControlDb, getTenantDrizzleDb } from '../db/turso'
import * as controlSchema from '../db/schema/control'
import * as tenantSchema from '../db/schema/tenant'
import { getTursoOrganizationMetrics, testDatabasePing } from '../services/turso-platform'
import { recordAdminAuditLog } from './admin-audit'
import { apiError } from '../utils/errors'
import { getFirebaseAdminAuth } from '../utils/auth'

export async function listAdminTenants(filter?: { search?: string, tier?: string }) {
  await ensureControlDbBootstrapped()
  const controlDb = getControlDb()
  const rawTenants = await controlDb.select().from(controlSchema.tenants)
  const rawMemberships = await controlDb.select().from(controlSchema.memberships)

  const memberCountMap = new Map<string, number>()
  for (const m of rawMemberships) {
    memberCountMap.set(m.tenantId, (memberCountMap.get(m.tenantId) || 0) + 1)
  }

  let filtered = rawTenants

  if (filter?.tier && filter.tier !== 'all') {
    filtered = filtered.filter(t => t.tier === filter.tier)
  }

  if (filter?.search) {
    const q = filter.search.toLowerCase().trim()
    filtered = filtered.filter(t => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
  }

  const tenants = filtered.map(t => ({
    id: t.id,
    name: t.name,
    tier: t.tier as 'free' | 'premium',
    eggsPerTray: t.eggsPerTray,
    currency: t.currency,
    dbUrl: t.dbUrl,
    dbType: t.dbUrl.startsWith('file:') ? ('local' as const) : ('turso' as const),
    hasToken: Boolean(t.dbAuthToken),
    memberCount: memberCountMap.get(t.id) || 0,
    tursoStatus: 'ready',
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }))

  return { tenants, total: tenants.length }
}

export async function getAdminTenantDetails(tenantId: string) {
  const controlDb = getControlDb()
  const [tenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  if (!tenant) throw apiError(404, 'not_found')

  const memberships = await controlDb
    .select()
    .from(controlSchema.memberships)
    .where(eq(controlSchema.memberships.tenantId, tenantId))

  const adminAuth = getFirebaseAdminAuth()
  const members = await Promise.all(
    memberships.map(async (m) => {
      let email = ''
      try {
        const u = await adminAuth.getUser(m.userId)
        email = u.email || ''
      }
      catch {
        // Fallback if user lookup fails
      }
      return {
        userId: m.userId,
        email,
        role: 'owner',
        createdAt: m.createdAt,
      }
    }),
  )

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      tier: tenant.tier as 'free' | 'premium',
      eggsPerTray: tenant.eggsPerTray,
      currency: tenant.currency,
      dbUrl: tenant.dbUrl,
      hasToken: Boolean(tenant.dbAuthToken),
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    },
    members,
  }
}

export async function updateAdminTenantSettings(
  tenantId: string,
  params: { name?: string, tier?: 'free' | 'premium', eggsPerTray?: number, currency?: string },
  operatorEmail: string,
) {
  const controlDb = getControlDb()
  const [existing] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  if (!existing) throw apiError(404, 'not_found')

  const now = new Date().toISOString()
  const updates: Partial<controlSchema.ControlTenantRow> = { updatedAt: now }

  if (params.name !== undefined) updates.name = params.name.trim()
  if (params.tier !== undefined) updates.tier = params.tier
  if (params.eggsPerTray !== undefined) updates.eggsPerTray = params.eggsPerTray
  if (params.currency !== undefined) updates.currency = params.currency.trim().toUpperCase()

  await controlDb
    .update(controlSchema.tenants)
    .set(updates)
    .where(eq(controlSchema.tenants.id, tenantId))

  // Sync to tenant DB farm_settings if accessible
  try {
    const tenantDb = getTenantDrizzleDb(existing.dbUrl, existing.dbAuthToken || undefined)
    const tenantSettingUpdates: Record<string, unknown> = { updatedAt: now }
    if (params.name) tenantSettingUpdates.farmName = params.name.trim()
    if (params.tier) tenantSettingUpdates.tier = params.tier
    if (params.eggsPerTray) tenantSettingUpdates.eggsPerTray = params.eggsPerTray
    if (params.currency) tenantSettingUpdates.currency = params.currency.trim().toUpperCase()

    await tenantDb
      .update(tenantSchema.farmSettings)
      .set(tenantSettingUpdates)
      .where(eq(tenantSchema.farmSettings.id, 'default'))
  }
  catch (e) {
    console.warn('[admin-tenants] could not sync settings to tenant DB:', (e as Error).message)
  }

  await recordAdminAuditLog({
    operatorEmail,
    actionType: 'tenant_settings_update',
    targetId: tenantId,
    summary: `Updated settings for ${existing.name}`,
    details: updates,
  })

  const [updated] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  return { success: true, tenant: updated }
}

export async function testTenantDbConnection(tenantId: string) {
  const controlDb = getControlDb()
  const [tenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  if (!tenant) throw apiError(404, 'not_found')

  return await testDatabasePing(tenant.dbUrl, tenant.dbAuthToken || undefined)
}

export async function getAdminFleetMetrics() {
  await ensureControlDbBootstrapped()
  const tursoMetrics = await getTursoOrganizationMetrics()
  const controlDb = getControlDb()

  const allTenants = await controlDb.select().from(controlSchema.tenants)
  const allMemberships = await controlDb.select().from(controlSchema.memberships)

  return {
    turso: tursoMetrics,
    fleet: {
      totalTenants: allTenants.length,
      totalUsers: allMemberships.length,
      pendingMigrationsCount: 0,
      desyncTenantsCount: 0,
    },
  }
}
