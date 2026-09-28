// POST /api/sales/:id/mark-delivered (§3.3): completes a Pending delivery, stamping the delivered date, every
// line at once (AC33, AC34). Already complete is treated as done (AC37): `changed: false`, no re-check of the date.
// 200 SaleChangeResponse | 400 validation_failed (deliveredDate) | 404 not_found |
// 409 conflict stock_short (+ shortfall) or voided (+ sale) | 401 | 403 | 500.
import { getRouterParams, readBody } from 'h3'
import { markSaleDeliveredBodySchema, saleIdParamsSchema } from '../../../../shared/schemas/sales'
import type { SaleChangeResponse } from '../../../../shared/types/api'
import { markSaleDelivered } from '../../../repositories/sales'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<SaleChangeResponse> => {
  const { id } = validateInput(saleIdParamsSchema, getRouterParams(event, { decode: true }))
  const body = validateInput(markSaleDeliveredBodySchema, await readBody(event))
  return markSaleDelivered(ctx.db, id, body)
})
