// Inventory repository (docs/features/06-inventory.md §3.3). Read-only: ONE security invoker function, `get_inventory`,
// called through TenantDb.rpc (p_tenant_id comes from the server context). The payload holds egg counts and size
// metadata only, never client data. Logs SQLSTATE only (`[inventory] <scope> <code>`), never an error object.
import { z } from 'zod'
import type { ApiErrorData, InventoryResponse } from '../../shared/types/api'
import type { H3Error } from 'h3'
import type { TenantDb } from '../utils/db'
import { apiError } from '../utils/errors'

const inventorySizeSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  colorSlot: z.number().int(),
  active: z.boolean(),
  onHandEggs: z.number().int(),
  owedEggs: z.number().int().min(0),
})

const inventorySchema = z.object({ hasAny: z.boolean(), sizes: z.array(inventorySizeSchema) })

function internalError(scope: string, code?: string | null): H3Error<ApiErrorData> {
  console.error(`[inventory] ${scope} ${typeof code === 'string' ? code : 'unknown'}`)
  return apiError(500, 'internal')
}

/** The Inventory screen payload. TM006 (tenant mismatch) and an unexpected shape are both 500 internal. */
export async function getInventory(db: TenantDb): Promise<InventoryResponse> {
  const { data, error } = await db.rpc('get_inventory', {})
  if (error) throw internalError('get_inventory', error.code)
  const parsed = inventorySchema.safeParse(data)
  if (!parsed.success) throw internalError('unexpected get_inventory result')
  return parsed.data
}
