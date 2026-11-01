import type { FarmSummary } from '../../shared/types/api'
import type { TenantDb } from '../utils/db'
import { RepositoryError } from '../utils/errors'
import { FARM_SUMMARY_COLUMNS, toFarmSizes, toFarmSummary } from '../../core/repositories/tenants'
import type { FarmSummaryRow, SizeRowForFarm } from '../../core/repositories/tenants'

export { FARM_SUMMARY_COLUMNS, toFarmSizes, toFarmSummary }
export type { FarmSummaryRow, SizeRowForFarm }

/** The signed-in user's farm. `tenants` is the root table, so it is scoped by `id`, not `tenant_id`. */
export async function getCurrentFarm(db: TenantDb): Promise<FarmSummary | null> {
  const { data, error } = await db.client
    .from('tenants')
    .select(FARM_SUMMARY_COLUMNS)
    .eq('id', db.tenantId)
    .maybeSingle()

  if (error) throw new RepositoryError('farm lookup failed', error.code)
  return data ? toFarmSummary(data as unknown as FarmSummaryRow) : null
}

interface LooseRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown, error: { code: string } | null }>
}

export async function updateFarmSettings(
  db: TenantDb,
  input: { farmName?: string, eggsPerTray?: number, currency?: string },
): Promise<FarmSummary> {
  const client = db.client as unknown as LooseRpcClient
  const { data, error } = await client.rpc('update_farm_settings', {
    p_farm_name: input.farmName,
    p_eggs_per_tray: input.eggsPerTray,
    p_currency: input.currency,
  })
  if (error) throw new RepositoryError('update farm settings failed', error.code)
  return data as FarmSummary
}
