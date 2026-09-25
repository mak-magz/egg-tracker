import type { Database } from '../../shared/types/database.types'
import type { FarmSummary } from '../../shared/types/api'
import type { TenantDb } from '../utils/db'

type TenantRow = Database['public']['Tables']['tenants']['Row']

export function toFarmSummary(row: Pick<TenantRow, 'id' | 'name' | 'eggs_per_tray'>): FarmSummary {
  return { id: row.id, name: row.name, eggsPerTray: row.eggs_per_tray }
}

/** The signed-in user's farm. `tenants` is the root table, so it is scoped by `id`, not `tenant_id`. */
export async function getCurrentFarm(db: TenantDb): Promise<FarmSummary | null> {
  const { data, error } = await db.client
    .from('tenants')
    .select('id, name, eggs_per_tray')
    .eq('id', db.tenantId)
    .maybeSingle()

  if (error) throw error
  return data ? toFarmSummary(data) : null
}
