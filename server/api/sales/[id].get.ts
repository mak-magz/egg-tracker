// GET /api/sales/:id (§3.3): one sale's full detail (AC6).
// 200 SaleResponse | 404 not_found | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { saleIdParamsSchema } from '../../../shared/schemas/sales'
import type { SaleResponse } from '../../../shared/types/api'
import { getSale } from '../../repositories/sales'
import { apiError, validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<SaleResponse> => {
  const { id } = validateInput(saleIdParamsSchema, getRouterParams(event, { decode: true }))
  const sale = await getSale(ctx.db, id)
  if (!sale) throw apiError(404, 'not_found')
  return { sale }
})
