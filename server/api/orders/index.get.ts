// GET /api/orders?view&clientId&from&to&limit&offset (docs/features/05-orders.md §3.4). The Open view returns EVERY
// open order and ignores limit/offset (AC5); other views page (AC49). Only `clientId` leaves here, never a name.
// 200 OrdersListResponse | 400 validation_failed | 401 | 403 | 500.
import { getQuery } from 'h3'
import { ordersQuerySchema } from '../../../shared/schemas/orders'
import type { OrdersListResponse } from '../../../shared/types/api'
import { listOrders } from '../../repositories/orders'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<OrdersListResponse> => {
  const query = validateInput(ordersQuerySchema, getQuery(event))
  return listOrders(ctx.db, query)
})
