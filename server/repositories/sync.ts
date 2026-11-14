/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod'
import type { FarmSnapshotPayload } from '../../core/utils/sync-payload'
import type { DbError, TenantDb } from '../utils/db'
import { apiError } from '../utils/errors'
import { syncControlTenantMetadata } from './tenants'

export type { FarmSnapshotPayload }

export interface SyncPushMutation {
  id: string
  type: string
  payload: Record<string, unknown>
  occurredAt: string
}

export interface SyncPushParams {
  deviceId: string
  mutations: SyncPushMutation[]
}

export interface SyncPullParams {
  sinceVersion: number
  limit: number
  excludeDeviceId?: string
}

const snapshotResponseSchema = z.object({
  success: z.boolean(),
  baseVersion: z.number(),
  appliedAt: z.string(),
})

const pushResponseSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    status: z.enum(['applied', 'conflict_lww', 'rejected']),
    version: z.number(),
    error: z.string().optional(),
    code: z.string().optional(),
    reason: z.string().nullable().optional(),
  })),
  latestVersion: z.number(),
})

const pullResponseSchema = z.object({
  changes: z.array(z.object({
    version: z.number(),
    entityType: z.string(),
    entityId: z.string(),
    action: z.enum(['insert', 'update', 'delete']),
    deviceId: z.string(),
    occurredAt: z.string(),
    data: z.record(z.string(), z.any()),
  })),
  latestVersion: z.number(),
  hasMore: z.boolean(),
})

function internalError(scope: string, error?: DbError | null) {
  console.error(`[sync] ${scope} ${error?.code ?? 'unknown'}`)
  return apiError(500, 'internal')
}

export async function applyFarmSnapshot(db: TenantDb, snapshot: FarmSnapshotPayload) {
  const { data, error } = await db.client.rpc('sync_snapshot' as any, {
    p_snapshot: snapshot,
  } as any)

  if (error) throw internalError('apply snapshot failed', error)
  const parsed = snapshotResponseSchema.safeParse(data)
  if (!parsed.success) throw internalError('invalid snapshot response')

  if (snapshot.farmSettings) {
    await syncControlTenantMetadata(db.tenantId, {
      name: snapshot.farmSettings.name,
      eggsPerTray: snapshot.farmSettings.eggsPerTray,
      currency: snapshot.farmSettings.currency,
      tier: 'premium',
    })
  }

  return parsed.data
}

export async function applySyncPush(db: TenantDb, params: SyncPushParams) {
  const { data, error } = await db.client.rpc('sync_push' as any, {
    p_device_id: params.deviceId,
    p_mutations: params.mutations,
  } as any)

  if (error) throw internalError('sync push failed', error)
  const parsed = pushResponseSchema.safeParse(data)
  if (!parsed.success) throw internalError('invalid push response')

  const appliedIds = new Set(parsed.data.results.filter(r => r.status === 'applied').map(r => r.id))
  const appliedSettings = [...params.mutations]
    .reverse()
    .find(m => m.type === 'update_farm_settings' && appliedIds.has(m.id))

  if (appliedSettings) {
    const p = appliedSettings.payload as Record<string, any>
    await syncControlTenantMetadata(db.tenantId, {
      name: p.p_farm_name ?? p.farmName ?? p.name,
      eggsPerTray: p.p_eggs_per_tray ?? p.eggsPerTray,
      currency: p.p_currency ?? p.currency,
    })
  }

  return parsed.data
}

export async function pullSyncChanges(db: TenantDb, params: SyncPullParams) {
  const { data, error } = await db.client.rpc('sync_pull' as any, {
    p_since_version: params.sinceVersion,
    p_limit: params.limit,
    p_exclude_device_id: params.excludeDeviceId ?? null,
  } as any)

  if (error) throw internalError('sync pull failed', error)
  const parsed = pullResponseSchema.safeParse(data)
  if (!parsed.success) throw internalError('invalid pull response')
  return parsed.data
}

export async function exportTenantSnapshot(db: TenantDb): Promise<{ snapshot: FarmSnapshotPayload, latestVersion: number }> {
  const { data, error } = await db.client.rpc('sync_export_snapshot' as any, {} as any)
  if (error) throw internalError('export snapshot failed', error)
  if (!data) throw internalError('invalid export snapshot response')
  return data as { snapshot: FarmSnapshotPayload, latestVersion: number }
}
