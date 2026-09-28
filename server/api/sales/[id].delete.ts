// DELETE /api/sales/:id (§3.3): removes a PENDING sale for good, lines included (AC44). A complete or voided sale
// is refused: correct it by editing its lines, or Void it (AC67).
// 200 DeleteSaleResponse | 404 not_found | 409 conflict not_pending (+ sale) | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { saleIdParamsSchema } from '../../../shared/schemas/sales'
import type { DeleteSaleResponse } from '../../../shared/types/api'
import { deleteSale } from '../../repositories/sales'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<DeleteSaleResponse> => {
  const { id } = validateInput(saleIdParamsSchema, getRouterParams(event, { decode: true }))
  return deleteSale(ctx.db, id)
})
