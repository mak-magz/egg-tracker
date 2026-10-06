// POST /api/orders (§3.4): creates an order (header + 1-20 lines) in one transaction. Idempotent per submissionId (AC16).
// 200 CreateOrderResponse | 400 validation_failed | 401 | 403 | 500.
import { readBody } from 'h3'
import { createOrderBodySchema } from '../../../shared/schemas/orders'
import type { CreateOrderResponse } from '../../../shared/types/api'
import { createOrder } from '../../repositories/orders'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<CreateOrderResponse> => {
  const body = validateInput(createOrderBodySchema, await readBody(event))
  return createOrder(ctx.db, body)
})
