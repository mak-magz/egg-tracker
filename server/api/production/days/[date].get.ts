// GET /api/production/days/:date (§3.3). `day: null` when the date has no production (not a 404).
// 200 ProductionDayResponse | 400 validation_failed (date) | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { productionDayParamsSchema } from '../../../../shared/schemas/production'
import type { ProductionDayResponse } from '../../../../shared/types/api'
import { getProductionDay } from '../../../repositories/production'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<ProductionDayResponse> => {
  const { date } = validateInput(productionDayParamsSchema, getRouterParams(event, { decode: true }))
  return { day: await getProductionDay(ctx.db, date) }
})
