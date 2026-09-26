// GET /api/sizes (docs/features/02-farm-settings.md §3.3): ALL of the farm's sizes, active first, then archived.
// A quiet refresh for Settings and the stale-form path; sizes also ride on /api/me. Query strings are ignored.
// 200 SizesResponse | 401 | 403 | 500.
import type { SizesResponse } from '../../../shared/types/api'
import { listSizes } from '../../repositories/sizes'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (_event, ctx): Promise<SizesResponse> => {
  return { sizes: await listSizes(ctx.db) }
})
