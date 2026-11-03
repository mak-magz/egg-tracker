import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { getControlDb } from '../db/turso'
import * as controlSchema from '../db/schema/control'
import { recordAdminAuditLog } from './admin-audit'
import { apiError } from '../utils/errors'

export async function getFleetSyncTelemetry() {
  const controlDb = getControlDb()
  const tenants = await controlDb.select().from(controlSchema.tenants)

  const telemetry = await Promise.all(
    tenants.map(async (t) => {
      try {
        const client = createClient({
          url: t.dbUrl,
          authToken: t.dbAuthToken || undefined,
        })

        // Check if change_log table exists
        const tableCheck = await client.execute('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'change_log\'')
        if (tableCheck.rows.length === 0) {
          return {
            tenantId: t.id,
            farmName: t.name,
            changeLogVersion: 0,
            activeDevices30d: 0,
            lastPush: null,
            lastPull: null,
            health: 'idle' as const,
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

        let health: 'synced' | 'idle' | 'conflict' | 'error' = 'idle'
        if (lastPush) {
          const pushTime = new Date(lastPush.timestamp).getTime()
          const now = Date.now()
          if (now - pushTime < 24 * 60 * 60 * 1000) health = 'synced'
        }

        return {
          tenantId: t.id,
          farmName: t.name,
          changeLogVersion,
          activeDevices30d,
          lastPush,
          lastPull: lastPush, // Mirror push for baseline pull indicator
          health,
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
          health: 'error' as const,
        }
      }
    }),
  )

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

  const client = createClient({
    url: tenant.dbUrl,
    authToken: tenant.dbAuthToken || undefined,
  })

  const tableCheck = await client.execute('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'change_log\'')
  if (tableCheck.rows.length === 0) {
    return { changes: [], total: 0, page: options.page, limit: options.limit }
  }

  const offset = (options.page - 1) * options.limit
  let sql = 'SELECT version, entity_type, entity_id, action, device_id, occurred_at, data FROM change_log'
  const conditions = []
  const args = []

  if (options.entityType) {
    conditions.push('entity_type = ?')
    args.push(options.entityType)
  }
  if (options.deviceId) {
    conditions.push('device_id = ?')
    args.push(options.deviceId)
  }

  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
  sql += ' ORDER BY version DESC LIMIT ? OFFSET ?'
  args.push(options.limit, offset)

  const res = await client.execute({ sql, args })

  const changes = res.rows.map((r) => {
    let parsedData: Record<string, unknown>
    try {
      parsedData = JSON.parse(String(r.data))
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

  const countRes = await client.execute('SELECT COUNT(*) as c FROM change_log')
  const total = Number(countRes.rows[0]?.c || changes.length)

  return { changes, total, page: options.page, limit: options.limit }
}

export async function getTenantSyncIssues(tenantId: string) {
  const controlDb = getControlDb()
  const [tenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))

  if (!tenant) throw apiError(404, 'not_found')

  const client = createClient({
    url: tenant.dbUrl,
    authToken: tenant.dbAuthToken || undefined,
  })

  try {
    const res = await client.execute(
      'SELECT id, device_id, mutation_type, payload, error, occurred_at FROM outbox_mutations WHERE status = \'failed\' LIMIT 50',
    )
    const issues = res.rows.map((r) => {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(String(r.payload))
      }
      catch {
        payload = {}
      }
      return {
        id: String(r.id),
        mutationId: String(r.id),
        deviceId: String(r.device_id),
        error: String(r.error || 'Mutation rejected by validation'),
        occurredAt: String(r.occurred_at),
        payload,
      }
    })
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

  const client = createClient({
    url: tenant.dbUrl,
    authToken: tenant.dbAuthToken || undefined,
  })

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
