import type { Database } from '../../shared/types/database.types'
import type { FarmSize, FarmSummary } from '../../shared/types/api'
import type { TenantDb } from '../utils/db'
import { RepositoryError } from '../utils/errors'

type TenantRow = Database['public']['Tables']['tenants']['Row']
type SizeRow = Database['public']['Tables']['sizes']['Row']

/**
 * The tenants columns + embedded sizes every FarmSummary query selects (one round trip, feature 01 D10).
 * The FK hint (`sizes!sizes_tenant_id_fkey`) is required as of feature 04: `sale_lines` added a second FK path
 * from `tenants` to `sizes` (tenant_id, then sale_lines' composite FK to sizes), so PostgREST can no longer
 * infer a single embed relationship for a bare `sizes ( ... )` and errors with PGRST201 ("more than one
 * relationship was found"). Pin the direct one explicitly; do the same for any future `tenants`-embeds-`sizes`.
 */
export const FARM_SUMMARY_COLUMNS = 'id, name, eggs_per_tray, currency, sizes!sizes_tenant_id_fkey ( id, name, sort_order, color_slot, archived_at )'

export type FarmSummaryRow = Pick<TenantRow, 'id' | 'name' | 'eggs_per_tray' | 'currency'> & {
  sizes: SizeRowForFarm[] | null
}

function compareSizes(a: FarmSize, b: FarmSize): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export type SizeRowForFarm = Pick<SizeRow, 'id' | 'name' | 'sort_order' | 'color_slot' | 'archived_at'>

/**
 * ALL of the farm's sizes (active + archived), sorted by sortOrder, name, id. The ONE mapper and the ONE order:
 * `/api/me` and `GET /api/sizes` (feature 02) both use it. `sort_order` is kept compact with active sizes first
 * (docs/features/02-farm-settings.md D7), so this is also "active first, then archived".
 */
export function toFarmSizes(rows: readonly SizeRowForFarm[] | null): FarmSize[] {
  return (rows ?? [])
    .map(s => ({ id: s.id, name: s.name, sortOrder: s.sort_order, colorSlot: s.color_slot, active: s.archived_at === null }))
    .sort(compareSizes)
}

export function toFarmSummary(row: FarmSummaryRow): FarmSummary {
  // `currency` is the farm's own data (`tenants.currency`, an ISO code, default PHP). Any three capital letters may
  // arrive; the UI's shared price rule treats an unknown code as PHP (AC36).
  return { id: row.id, name: row.name, eggsPerTray: row.eggs_per_tray, currency: row.currency, sizes: toFarmSizes(row.sizes) }
}

/** The signed-in user's farm. `tenants` is the root table, so it is scoped by `id`, not `tenant_id`. */
export async function getCurrentFarm(db: TenantDb): Promise<FarmSummary | null> {
  const { data, error } = await db.client
    .from('tenants')
    .select(FARM_SUMMARY_COLUMNS)
    .eq('id', db.tenantId)
    .maybeSingle()

  if (error) throw new RepositoryError('farm lookup failed', error.code)
  return data ? toFarmSummary(data) : null
}
