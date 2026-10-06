// POST /api/orders/:id/deliver (§3.4, AC24-AC31): one delivery = one sale linked to the order. Idempotent per submissionId.
// 200 DeliverOrderResponse | 400 | 404 | 409 stock_short (+ shortfall) / over_delivery / order_closed / order_changed
// (+ order) | 401 | 403 | 500.
import { getRouterParams, readBody } from 'h3'
import { deliverOrderBodySchema, orderIdParamsSchema } from '../../../../shared/schemas/orders'
import type { DeliverOrderResponse } from '../../../../shared/types/api'
import { deliverOrder } from '../../../repositories/orders'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<DeliverOrderResponse> => {
  const { id } = validateInput(orderIdParamsSchema, getRouterParams(event, { decode: true }))
  const body = validateInput(deliverOrderBodySchema, await readBody(event))
  return deliverOrder(ctx.db, id, body)
})
