import type { Database } from '../../shared/types/database.types'
import type { FarmSize, FarmSummary } from '../../shared/types/api'
import type { TenantDb } from '../utils/db'

type TenantRow = Database['public']['Tables']['tenants']['Row']
type SizeRow = Database['public']['Tables']['sizes']['Row']

/** The tenants columns + embedded sizes every FarmSummary query selects (one round trip, feature 01 D10). */
export const FARM_SUMMARY_COLUMNS = 'id, name, eggs_per_tray, sizes ( id, name, sort_order, color_slot, archived_at )'

export type FarmSummaryRow = Pick<TenantRow, 'id' | 'name' | 'eggs_per_tray'> & {
  sizes: Pick<SizeRow, 'id' | 'name' | 'sort_order' | 'color_slot' | 'archived_at'>[] | null
}

function compareSizes(a: FarmSize, b: FarmSize): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** ALL of the farm's sizes (active + archived), sorted by sortOrder, name, id. */
export function toFarmSummary(row: FarmSummaryRow): FarmSummary {
  const sizes: FarmSize[] = (row.sizes ?? [])
    .map(s => ({ id: s.id, name: s.name, sortOrder: s.sort_order, colorSlot: s.color_slot, active: s.archived_at === null }))
    .sort(compareSizes)
  return { id: row.id, name: row.name, eggsPerTray: row.eggs_per_tray, sizes }
}

/** The signed-in user's farm. `tenants` is the root table, so it is scoped by `id`, not `tenant_id`. */
export async function getCurrentFarm(db: TenantDb): Promise<FarmSummary | null> {
  const { data, error } = await db.client
    .from('tenants')
    .select(FARM_SUMMARY_COLUMNS)
    .eq('id', db.tenantId)
    .maybeSingle()

  if (error) throw error
  return data ? toFarmSummary(data) : null
}
