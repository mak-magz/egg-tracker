import type { Database } from '../../shared/types/database.types'
import type { FarmSize, FarmSummary } from '../../shared/types/api'

type TenantRow = Database['public']['Tables']['tenants']['Row']
type SizeRow = Database['public']['Tables']['sizes']['Row']

export const FARM_SUMMARY_COLUMNS = 'id, name, eggs_per_tray, currency, sizes!sizes_tenant_id_fkey ( id, name, sort_order, color_slot, archived_at, default_price )'

export type FarmSummaryRow = Pick<TenantRow, 'id' | 'name' | 'eggs_per_tray' | 'currency'> & {
  sizes: SizeRowForFarm[] | null
}

function compareSizes(a: FarmSize, b: FarmSize): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export type SizeRowForFarm = Pick<SizeRow, 'id' | 'name' | 'sort_order' | 'color_slot' | 'archived_at'> & {
  default_price?: number | string | null
}

/**
 * ALL of the farm's sizes (active + archived), sorted by sortOrder, name, id.
 */
export function toFarmSizes(rows: readonly SizeRowForFarm[] | null): FarmSize[] {
  return (rows ?? [])
    .map(s => ({
      id: s.id,
      name: s.name,
      sortOrder: s.sort_order,
      colorSlot: s.color_slot,
      active: s.archived_at === null,
      defaultPrice: s.default_price !== undefined && s.default_price !== null ? Number(s.default_price) : null,
    }))
    .sort(compareSizes)
}

export function toFarmSummary(row: FarmSummaryRow): FarmSummary {
  return { id: row.id, name: row.name, eggsPerTray: row.eggs_per_tray, currency: row.currency, sizes: toFarmSizes(row.sizes) }
}
