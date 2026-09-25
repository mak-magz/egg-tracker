// POST /api/production/entries (§3.3): ADDS to the day. Idempotent per submissionId (AC12, AC13).
// 200 LogProductionResponse | 400 validation_failed (date, amounts, rejects, good.<sizeId>, sizes) | 401 | 403 | 500.
import { readBody } from 'h3'
import { logProductionBodySchema } from '../../../shared/schemas/production'
import type { LogProductionResponse } from '../../../shared/types/api'
import { logProduction } from '../../repositories/production'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<LogProductionResponse> => {
  const body = validateInput(logProductionBodySchema, await readBody(event))
  return logProduction(ctx.db, body)
})
