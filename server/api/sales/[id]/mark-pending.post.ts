// POST /api/sales/:id/mark-pending (§3.3): undoes a mark-delivered (AC39); puts every line's eggs back on hand.
// Never checks shortfall. Not offered by the UI for an on-site sale (the database backstops it, TM039 -> 500,
// unreachable from our routes).
// 200 SaleChangeResponse | 404 not_found | 409 conflict voided (+ sale) | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { saleIdParamsSchema } from '../../../../shared/schemas/sales'
import type { SaleChangeResponse } from '../../../../shared/types/api'
import { markSalePending } from '../../../repositories/sales'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<SaleChangeResponse> => {
  const { id } = validateInput(saleIdParamsSchema, getRouterParams(event, { decode: true }))
  return markSalePending(ctx.db, id)
})
