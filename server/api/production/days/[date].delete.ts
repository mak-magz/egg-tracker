// DELETE /api/production/days/:date (§3.3).
// 200 DeleteProductionDayResponse | 400 validation_failed (date) | 404 not_found | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { productionDayParamsSchema } from '../../../../shared/schemas/production'
import type { DeleteProductionDayResponse } from '../../../../shared/types/api'
import { deleteProductionDay } from '../../../repositories/production'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<DeleteProductionDayResponse> => {
  const { date } = validateInput(productionDayParamsSchema, getRouterParams(event, { decode: true }))
  return { removed: await deleteProductionDay(ctx.db, date) }
})
