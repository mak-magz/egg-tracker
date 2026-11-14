import { eq } from 'drizzle-orm'
import { getControlDb, getTenantLibsqlClient } from '../db/turso'
import * as controlSchema from '../db/schema/control'
import { recordAdminAuditLog } from './admin-audit'
import { apiError } from '../utils/errors'
import { mapWithConcurrency } from '../utils/concurrency'
import type { AdminSyncIssueItem, AdminSyncTelemetryItem } from '../../shared/types/api'

const PII_KEYS = new Set(['name', 'phone', 'notes', 'clientName', 'clientPhone'])

function scrubPii(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(scrubPii)
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      if (PII_KEYS.has(key)) {
        result[key] = '[redacted]'
      }
      else {
        result[key] = scrubPii(val)
      }
    }
    return result
  }
  return obj
}

export async function getFleetSyncTelemetry(): Promise<{ telemetry: AdminSyncTelemetryItem[] }> {
  const controlDb = getControlDb()
  const tenants = await controlDb.select().from(controlSchema.tenants)

  const telemetry = await mapWithConcurrency(tenants, 5, async (t): Promise<AdminSyncTelemetryItem> => {
    try {
      const client = getTenantLibsqlClient(t.dbUrl, t.dbAuthToken || undefined)

      const tableCheck = await client.execute('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'change_log\'')
      if (tableCheck.rows.length === 0) {
        return {
          tenantId: t.id,
          farmName: t.name,
          changeLogVersion: 0,
          activeDevices30d: 0,
          lastPush: null,
          lastPull: null,
          health: 'idle',
          unresolvedRejectionCount: 0,
        }
      }

      const maxVerRes = await client.execute('SELECT MAX(version) as max_ver FROM change_log')
      const changeLogVersion = Number(maxVerRes.rows[0]?.max_ver || 0)

      const recentPushRes = await client.execute(
        'SELECT device_id, occurred_at FROM change_log ORDER BY version DESC LIMIT 1',
      )
      const lastPush = recentPushRes.rows[0]
        ? {
            deviceId: String(recentPushRes.rows[0].device_id),
            timestamp: String(recentPushRes.rows[0].occurred_at),
          }
        : null

      const devicesRes = await client.execute('SELECT COUNT(DISTINCT device_id) as cnt FROM change_log')
      const activeDevices30d = Number(devicesRes.rows[0]?.cnt || 1)

      let unresolvedRejectionCount = 0
      try {
        const rejRes = await client.execute('SELECT COUNT(*) as cnt FROM sync_rejections WHERE resolved_at IS NULL')
        unresolvedRejectionCount = Number(rejRes.rows[0]?.cnt || 0)
      }
      catch {
        unresolvedRejectionCount = 0
      }

      let health: 'synced' | 'idle' | 'conflict' | 'error' = 'idle'
      if (unresolvedRejectionCount > 0) {
        health = 'conflict'
      }
      else if (lastPush) {
        const pushTime = new Date(lastPush.timestamp).getTime()
        if (Date.now() - pushTime < 24 * 60 * 60 * 1000) health = 'synced'
      }

      return {
        tenantId: t.id,
        farmName: t.name,
        changeLogVersion,
        activeDevices30d,
        lastPush,
        lastPull: lastPush,
        health,
        unresolvedRejectionCount,
      }
    }
    catch {
      return {
        tenantId: t.id,
        farmName: t.name,
        changeLogVersion: 0,
        activeDevices30d: 0,
        lastPush: null,
        lastPull: null,
        health: 'error',
        unresolvedRejectionCount: 0,
      }
    }
  })

  return { telemetry }
}

export async function getTenantChangeLog(
  tenantId: string,
  options: { page: number, limit: number, entityType?: string, deviceId?: string },
) {
  const controlDb = getControlDb()
  const [tenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  if (!tenant) throw apiError(404, 'not_found')

  const client = getTenantLibsqlClient(tenant.dbUrl, tenant.dbAuthToken || undefined)

  const tableCheck = await client.execute('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'change_log\'')
  if (tableCheck.rows.length === 0) {
    return { changes: [], total: 0, page: options.page, limit: options.limit }
  }

  const page = Math.max(1, Math.floor(options.page || 1))
  const limit = Math.min(200, Math.max(1, Math.floor(options.limit || 50)))
  const offset = (page - 1) * limit
  let sql = 'SELECT version, entity_type, entity_id, action, device_id, occurred_at, data FROM change_log'
  const conditions: string[] = []
  const filterArgs: Array<string | number> = []

  if (options.entityType) {
    conditions.push('entity_type = ?')
    filterArgs.push(options.entityType)
  }
  if (options.deviceId) {
    conditions.push('device_id = ?')
    filterArgs.push(options.deviceId)
  }

  const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''
  sql += whereClause + ' ORDER BY version DESC LIMIT ? OFFSET ?'

  const res = await client.execute({ sql, args: [...filterArgs, limit, offset] })

  const changes = res.rows.map((r) => {
    let parsedData: Record<string, unknown>
    try {
      const rawParsed = JSON.parse(String(r.data))
      parsedData = scrubPii(rawParsed) as Record<string, unknown>
    }
    catch {
      parsedData = {}
    }

    return {
      version: Number(r.version),
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      action: String(r.action) as 'insert' | 'update' | 'delete',
      deviceId: String(r.device_id),
      occurredAt: String(r.occurred_at),
      data: parsedData,
    }
  })

  const countSql = `SELECT COUNT(*) as c FROM change_log${whereClause}`
  const countRes = await client.execute({ sql: countSql, args: filterArgs })
  const total = Number(countRes.rows[0]?.c ?? 0)

  return { changes, total, page, limit }
}

export async function getTenantSyncIssues(tenantId: string): Promise<{ issues: AdminSyncIssueItem[] }> {
  const controlDb = getControlDb()
  const [tenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  if (!tenant) throw apiError(404, 'not_found')

  const client = getTenantLibsqlClient(tenant.dbUrl, tenant.dbAuthToken || undefined)

  try {
    const res = await client.execute(
      'SELECT id, mutation_id, device_id, mutation_type, entity_ref, error_code, reason, error_message, occurred_at, rejected_at, resolved_at FROM sync_rejections WHERE resolved_at IS NULL ORDER BY rejected_at DESC LIMIT 50',
    )
    const issues: AdminSyncIssueItem[] = res.rows.map(r => ({
      id: String(r.id),
      mutationId: String(r.mutation_id),
      deviceId: String(r.device_id),
      mutationType: String(r.mutation_type),
      entityRef: String(r.entity_ref),
      errorCode: String(r.error_code),
      reason: r.reason ? String(r.reason) : null,
      error: String(r.error_message || 'Mutation rejected by server validation.'),
      occurredAt: String(r.occurred_at),
      rejectedAt: String(r.rejected_at),
      resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
      payload: {
        mutationType: String(r.mutation_type),
        entityRef: String(r.entity_ref),
        errorCode: String(r.error_code),
        reason: r.reason ? String(r.reason) : null,
      },
    }))
    return { issues }
  }
  catch {
    return { issues: [] }
  }
}

export async function prepareFreshSyncSnapshot(tenantId: string, operatorEmail: string) {
  const controlDb = getControlDb()
  const [tenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  if (!tenant) throw apiError(404, 'not_found')

  const client = getTenantLibsqlClient(tenant.dbUrl, tenant.dbAuthToken || undefined)

  const now = new Date().toISOString()
  const maxVerRes = await client.execute('SELECT MAX(version) as max_ver FROM change_log')
  const baseVersion = Number(maxVerRes.rows[0]?.max_ver || 0)

  await client.execute({
    sql: 'INSERT OR REPLACE INTO sync_state (id, status, last_pulled_version, last_pulled_at, updated_at) VALUES (\'default\', \'synced\', ?, ?, ?)',
    args: [baseVersion, now, now],
  })

  await recordAdminAuditLog({
    operatorEmail,
    actionType: 'sync_snapshot_reset',
    targetId: tenantId,
    summary: `Prepared fresh sync snapshot baseline v${baseVersion} for ${tenant.name}`,
  })

  return { success: true, baseVersion, appliedAt: now }
}
