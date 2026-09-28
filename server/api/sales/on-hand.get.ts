// GET /api/sales/on-hand?sizeId=...&sizeId=... (§3.3): eggs on hand per size (AC25), shared with the future
// Inventory feature. Omit sizeId to get every size of the farm.
// 200 OnHandResponse | 400 validation_failed | 401 | 403 | 500.
import { getQuery } from 'h3'
import { onHandQuerySchema } from '../../../shared/schemas/sales'
import type { OnHandResponse } from '../../../shared/types/api'
import { getOnHand } from '../../repositories/sales'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<OnHandResponse> => {
  const { sizeId } = validateInput(onHandQuerySchema, getQuery(event))
  return getOnHand(ctx.db, sizeId)
})
