import { randomUUID } from 'node:crypto'
import { desc, like, or } from 'drizzle-orm'
import { ensureControlDbBootstrapped, getControlDb } from '../db/turso'
import * as controlSchema from '../db/schema/control'

export type AdminActionType
  = | 'tenant_provision'
    | 'tenant_settings_update'
    | 'user_assign'
    | 'user_transfer'
    | 'user_unlink'
    | 'user_password_reset'
    | 'schema_migration'
    | 'sync_snapshot_reset'
    | 'operator_login'

export interface RecordAdminAuditEntry {
  operatorEmail: string
  actionType: AdminActionType
  targetId: string
  summary: string
  details?: unknown
}

export async function recordAdminAuditLog(entry: RecordAdminAuditEntry): Promise<void> {
  try {
    await ensureControlDbBootstrapped()
    const controlDb = getControlDb()
    await controlDb.insert(controlSchema.adminAuditLogs).values({
      id: randomUUID(),
      operatorEmail: entry.operatorEmail,
      actionType: entry.actionType,
      targetId: entry.targetId,
      summary: entry.summary,
      details: entry.details ? JSON.stringify(entry.details) : null,
      createdAt: new Date().toISOString(),
    })
  }
  catch (e) {
    console.error('[audit] failed to write admin audit log:', (e as Error).message)
  }
}

export async function listAdminAuditLogs(options?: { page?: number, limit?: number, query?: string }) {
  await ensureControlDbBootstrapped()
  const controlDb = getControlDb()
  const page = Math.max(1, options?.page || 1)
  const limit = Math.min(100, Math.max(1, options?.limit || 50))
  const offset = (page - 1) * limit
  const query = options?.query?.trim()

  const baseQuery = controlDb.select().from(controlSchema.adminAuditLogs)

  let rows
  if (query) {
    const pattern = `%${query}%`
    rows = await baseQuery
      .where(
        or(
          like(controlSchema.adminAuditLogs.operatorEmail, pattern),
          like(controlSchema.adminAuditLogs.actionType, pattern),
          like(controlSchema.adminAuditLogs.targetId, pattern),
          like(controlSchema.adminAuditLogs.summary, pattern),
        ),
      )
      .orderBy(desc(controlSchema.adminAuditLogs.createdAt))
      .limit(limit)
      .offset(offset)
  }
  else {
    rows = await baseQuery
      .orderBy(desc(controlSchema.adminAuditLogs.createdAt))
      .limit(limit)
      .offset(offset)
  }

  const all = await controlDb.select({ id: controlSchema.adminAuditLogs.id }).from(controlSchema.adminAuditLogs)
  const total = all.length

  return {
    logs: rows.map(r => ({
      id: r.id,
      operatorEmail: r.operatorEmail,
      actionType: r.actionType,
      targetId: r.targetId,
      summary: r.summary,
      details: r.details,
      createdAt: r.createdAt,
    })),
    total,
    page,
    limit,
  }
}
