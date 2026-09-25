// PUT /api/production/days/:date (§3.3): Edit day, REPLACES the day's amounts.
// 200 ReplaceProductionDayResponse | 400 validation_failed | 404 not_found (no production that day) | 401 | 403 | 500.
import { getRouterParams, readBody } from 'h3'
import { productionDayParamsSchema, replaceProductionDayBodySchema } from '../../../../shared/schemas/production'
import type { ReplaceProductionDayResponse } from '../../../../shared/types/api'
import { replaceProductionDay } from '../../../repositories/production'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<ReplaceProductionDayResponse> => {
  const { date } = validateInput(productionDayParamsSchema, getRouterParams(event, { decode: true }))
  const amounts = validateInput(replaceProductionDayBodySchema, await readBody(event))
  return { day: await replaceProductionDay(ctx.db, date, amounts) }
})
