// POST /api/orders/:id/cancel (§3.4, AC22): no body. Only before the first non-voided delivery.
// 200 OrderChangeResponse | 404 | 409 has_delivery / order_closed (+ order) | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { orderIdParamsSchema } from '../../../../shared/schemas/orders'
import type { OrderChangeResponse } from '../../../../shared/types/api'
import { cancelOrder } from '../../../repositories/orders'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<OrderChangeResponse> => {
  const { id } = validateInput(orderIdParamsSchema, getRouterParams(event, { decode: true }))
  return cancelOrder(ctx.db, id)
})
