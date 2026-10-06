// POST /api/orders/:id/status (§3.4, AC21): moves an order among Requested, Confirmed and Ready.
// 200 OrderChangeResponse | 400 | 404 | 409 order_closed / has_delivery (+ order) | 401 | 403 | 500.
import { getRouterParams, readBody } from 'h3'
import { orderIdParamsSchema, setOrderStatusBodySchema } from '../../../../shared/schemas/orders'
import type { OrderChangeResponse } from '../../../../shared/types/api'
import { setOrderStatus } from '../../../repositories/orders'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<OrderChangeResponse> => {
  const { id } = validateInput(orderIdParamsSchema, getRouterParams(event, { decode: true }))
  const body = validateInput(setOrderStatusBodySchema, await readBody(event))
  return setOrderStatus(ctx.db, id, body.status)
})
