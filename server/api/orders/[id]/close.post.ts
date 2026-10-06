// POST /api/orders/:id/close (§3.4, AC34): closes a Partially fulfilled order short, one-way.
// 200 OrderChangeResponse | 400 | 404 | 409 not_partial / order_changed (+ order) | 401 | 403 | 500.
import { getRouterParams, readBody } from 'h3'
import { closeOrderBodySchema, orderIdParamsSchema } from '../../../../shared/schemas/orders'
import type { OrderChangeResponse } from '../../../../shared/types/api'
import { closeOrder } from '../../../repositories/orders'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<OrderChangeResponse> => {
  const { id } = validateInput(orderIdParamsSchema, getRouterParams(event, { decode: true }))
  const body = validateInput(closeOrderBodySchema, await readBody(event))
  return closeOrder(ctx.db, id, body)
})
