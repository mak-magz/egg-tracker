// GET /api/inventory (docs/features/06-inventory.md §3.3): eggs on hand (may be negative) and eggs owed on open
// orders, per size. Read-only, no input. 200 InventoryResponse | 401 | 403 | 500.
import type { InventoryResponse } from '../../../shared/types/api'
import { getInventory } from '../../repositories/inventory'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (_event, ctx): Promise<InventoryResponse> => getInventory(ctx.db))
