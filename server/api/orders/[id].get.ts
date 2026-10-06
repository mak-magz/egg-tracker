// GET /api/orders/:id (§3.4): one order with its deliveries. 200 OrderResponse | 404 not_found | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { orderIdParamsSchema } from '../../../shared/schemas/orders'
import type { OrderResponse } from '../../../shared/types/api'
import { getOrder } from '../../repositories/orders'
import { apiError, validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<OrderResponse> => {
  const { id } = validateInput(orderIdParamsSchema, getRouterParams(event, { decode: true }))
  const order = await getOrder(ctx.db, id)
  if (!order) throw apiError(404, 'not_found')
  return { order }
})
