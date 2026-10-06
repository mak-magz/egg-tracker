// PUT /api/orders/:id (§3.4): REPLACES the whole order (header + every line); carries the `version` the form opened with.
// 200 OrderChangeResponse | 400 validation_failed | 404 | 409 order_changed / order_closed (+ order) | 401 | 403 | 500.
import { getRouterParams, readBody } from 'h3'
import { orderIdParamsSchema, updateOrderBodySchema } from '../../../shared/schemas/orders'
import type { OrderChangeResponse } from '../../../shared/types/api'
import { updateOrder } from '../../repositories/orders'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<OrderChangeResponse> => {
  const { id } = validateInput(orderIdParamsSchema, getRouterParams(event, { decode: true }))
  const body = validateInput(updateOrderBodySchema, await readBody(event))
  return updateOrder(ctx.db, id, body)
})
