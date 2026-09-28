// GET /api/sales?from&to&status&type&clientId&limit&offset&includeVoided (docs/features/04-sales.md §3.3).
// Filtered and paginated server-side (D4); the Pending filter is never capped (AC9). Client names never leave
// this route (only `clientId`); the frontend joins names client-side, exactly as Clients and Production do.
// 200 SalesListResponse | 400 validation_failed (from/to) | 401 | 403 | 500.
import { getQuery } from 'h3'
import { salesListQuerySchema } from '../../../shared/schemas/sales'
import type { SalesListResponse } from '../../../shared/types/api'
import { listSales } from '../../repositories/sales'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<SalesListResponse> => {
  const query = validateInput(salesListQuerySchema, getQuery(event))
  return listSales(ctx.db, {
    from: query.from,
    to: query.to,
    status: query.status,
    type: query.type,
    clientId: query.clientId,
    limit: query.limit,
    offset: query.offset,
    includeVoided: query.includeVoided,
  })
})
