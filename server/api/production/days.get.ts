// GET /api/production/days?from=&to= (docs/features/01-production-logging.md §3.3).
// 200 ProductionDaysResponse | 400 validation_failed (from/to) | 401 | 403 | 500.
import { getQuery } from 'h3'
import { productionRangeQuerySchema } from '../../../shared/schemas/production'
import type { ProductionDaysResponse } from '../../../shared/types/api'
import { listProductionDays } from '../../repositories/production'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<ProductionDaysResponse> => {
  const range = validateInput(productionRangeQuerySchema, getQuery(event))
  return listProductionDays(ctx.db, range)
})
