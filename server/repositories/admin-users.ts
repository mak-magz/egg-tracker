import { eq } from 'drizzle-orm'
import { ensureControlDbBootstrapped, getControlDb } from '../db/turso'
import * as controlSchema from '../db/schema/control'
import { getFirebaseAdminAuth } from '../utils/auth'
import { recordAdminAuditLog } from './admin-audit'
import { apiError } from '../utils/errors'

export async function listFirebaseUsers(filter?: { search?: string }) {
  await ensureControlDbBootstrapped()
  const adminAuth = getFirebaseAdminAuth()
  const controlDb = getControlDb()

  const listResult = await adminAuth.listUsers(1000)
  const memberships = await controlDb.select().from(controlSchema.memberships)
  const tenants = await controlDb.select().from(controlSchema.tenants)
  const allAdmins = await controlDb.select().from(controlSchema.admins)

  const tenantMap = new Map<string, string>()
  for (const t of tenants) tenantMap.set(t.id, t.name)

  const membershipMap = new Map<string, { tenantId: string, farmName: string }>()
  for (const m of memberships) {
    membershipMap.set(m.userId, {
      tenantId: m.tenantId,
      farmName: tenantMap.get(m.tenantId) || 'Unknown Farm',
    })
  }

  const adminMap = new Map<string, { role: string, isActive: number }>()
  for (const a of allAdmins) {
    adminMap.set(a.userId, {
      role: a.role,
      isActive: a.isActive,
    })
  }

  let users = listResult.users.map((u) => {
    const mem = membershipMap.get(u.uid)
    const adm = adminMap.get(u.uid)
    return {
      uid: u.uid,
      email: u.email || '',
      emailVerified: u.emailVerified,
      tenantId: mem?.tenantId || null,
      farmName: mem?.farmName || null,
      isAdmin: Boolean(adm),
      adminRole: adm ? adm.role : null,
      adminActive: adm ? adm.isActive === 1 : null,
      createdAt: u.metadata.creationTime,
      lastSignInAt: u.metadata.lastSignInTime || null,
    }
  })

  if (filter?.search) {
    const q = filter.search.toLowerCase().trim()
    users = users.filter(u =>
      u.email.toLowerCase().includes(q)
      || u.uid.toLowerCase().includes(q)
      || (u.farmName && u.farmName.toLowerCase().includes(q)),
    )
  }

  return { users, total: users.length }
}

export async function assignUserToFarm(uid: string, tenantId: string, operatorEmail: string) {
  const controlDb = getControlDb()
  const [existingTenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  if (!existingTenant) throw apiError(404, 'not_found')

  // Check if uid is an active platform operator
  const [adminRow] = await controlDb
    .select()
    .from(controlSchema.admins)
    .where(eq(controlSchema.admins.userId, uid))

  if (adminRow && adminRow.isActive === 1) {
    throw apiError(400, 'bad_request', 'Platform operators cannot be assigned to a tenant farm')
  }

  const [existingMembership] = await controlDb
    .select()
    .from(controlSchema.memberships)
    .where(eq(controlSchema.memberships.userId, uid))

  if (existingMembership) {
    throw apiError(409, 'conflict', undefined, { reason: 'client_changed' })
  }

  const now = new Date().toISOString()
  await controlDb.insert(controlSchema.memberships).values({
    id: crypto.randomUUID(),
    tenantId,
    userId: uid,
    createdAt: now,
    updatedAt: now,
  })

  await recordAdminAuditLog({
    operatorEmail,
    actionType: 'user_assign',
    targetId: uid,
    summary: `Assigned user to ${existingTenant.name}`,
    details: { tenantId, farmName: existingTenant.name },
  })

  return { success: true }
}

export async function reassignUserFarm(uid: string, newTenantId: string, operatorEmail: string) {
  const controlDb = getControlDb()
  const [targetTenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, newTenantId))

  if (!targetTenant) throw apiError(404, 'not_found')

  // Check if uid is an active platform operator
  const [adminRow] = await controlDb
    .select()
    .from(controlSchema.admins)
    .where(eq(controlSchema.admins.userId, uid))

  if (adminRow && adminRow.isActive === 1) {
    throw apiError(400, 'bad_request', 'Platform operators cannot be assigned to a tenant farm')
  }

  const [membership] = await controlDb
    .select()
    .from(controlSchema.memberships)
    .where(eq(controlSchema.memberships.userId, uid))

  if (!membership) {
    throw apiError(404, 'not_found')
  }

  const now = new Date().toISOString()
  await controlDb
    .update(controlSchema.memberships)
    .set({ tenantId: newTenantId, updatedAt: now })
    .where(eq(controlSchema.memberships.id, membership.id))

  // AC21: Revoke refresh tokens to force token invalidation immediately
  const adminAuth = getFirebaseAdminAuth()
  await adminAuth.revokeRefreshTokens(uid)

  await recordAdminAuditLog({
    operatorEmail,
    actionType: 'user_transfer',
    targetId: uid,
    summary: `Transferred user to ${targetTenant.name}`,
    details: { fromTenantId: membership.tenantId, toTenantId: newTenantId },
  })

  return { success: true, sessionsRevoked: true }
}

export async function unlinkUserFromFarm(uid: string, operatorEmail: string) {
  const controlDb = getControlDb()
  const [membership] = await controlDb
    .select()
    .from(controlSchema.memberships)
    .where(eq(controlSchema.memberships.userId, uid))

  if (!membership) throw apiError(404, 'not_found')

  // Check if sole member
  const allMembers = await controlDb
    .select()
    .from(controlSchema.memberships)
    .where(eq(controlSchema.memberships.tenantId, membership.tenantId))

  const wasSoleMember = allMembers.length <= 1

  await controlDb
    .delete(controlSchema.memberships)
    .where(eq(controlSchema.memberships.id, membership.id))

  await recordAdminAuditLog({
    operatorEmail,
    actionType: 'user_unlink',
    targetId: uid,
    summary: `Unlinked user from farm ${membership.tenantId}`,
    details: { tenantId: membership.tenantId, wasSoleMember },
  })

  return { success: true, wasSoleMember }
}

export async function sendUserPasswordReset(uid: string, operatorEmail: string) {
  const adminAuth = getFirebaseAdminAuth()
  const user = await adminAuth.getUser(uid)
  if (!user.email) throw apiError(400, 'validation_failed')

  await adminAuth.generatePasswordResetLink(user.email)

  await recordAdminAuditLog({
    operatorEmail,
    actionType: 'user_password_reset',
    targetId: uid,
    summary: `Triggered password reset link for ${user.email}`,
  })

  return { success: true, emailSent: true }
}

export interface AdminRecord {
  id: string
  userId: string
  email: string
  role: string
  isActive: boolean
}

export async function findAdminByUserId(userId: string): Promise<AdminRecord | null> {
  await ensureControlDbBootstrapped()
  const controlDb = getControlDb()
  const [row] = await controlDb
    .select()
    .from(controlSchema.admins)
    .where(eq(controlSchema.admins.userId, userId))

  if (!row) return null
  return {
    id: row.id,
    userId: row.userId,
    email: row.email,
    role: row.role,
    isActive: row.isActive === 1,
  }
}

export async function upsertAdminUser(
  userId: string,
  email: string,
  role: 'superadmin' | 'support' | 'viewer' = 'superadmin',
): Promise<void> {
  await ensureControlDbBootstrapped()
  const controlDb = getControlDb()
  const now = new Date().toISOString()
  const normalizedEmail = email.toLowerCase()

  const [existing] = await controlDb
    .select()
    .from(controlSchema.admins)
    .where(eq(controlSchema.admins.userId, userId))

  if (existing) {
    await controlDb
      .update(controlSchema.admins)
      .set({
        email: normalizedEmail,
        role,
        isActive: 1,
        updatedAt: now,
      })
      .where(eq(controlSchema.admins.id, existing.id))
  }
  else {
    await controlDb.insert(controlSchema.admins).values({
      id: crypto.randomUUID(),
      userId,
      email: normalizedEmail,
      role,
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    })
  }
}
