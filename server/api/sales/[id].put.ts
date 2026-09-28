// PUT /api/sales/:id (§3.3): REPLACES the whole sale (header + every line), including the type (AC40, AC64-66).
// Carries the `version` the form was opened with (AC43).
// 200 SaleChangeResponse (`changed: false` when nothing differed) | 400 validation_failed (type, clientId,
// saleDate, deliveredDate, lines, version) | 404 not_found | 409 conflict sale_changed (+ sale), stock_short
// (+ shortfall) or voided (+ sale) | 401 | 403 | 500.
import { getRouterParams, readBody } from 'h3'
import { saleIdParamsSchema, updateSaleBodySchema } from '../../../shared/schemas/sales'
import type { SaleChangeResponse } from '../../../shared/types/api'
import { updateSale } from '../../repositories/sales'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<SaleChangeResponse> => {
  const { id } = validateInput(saleIdParamsSchema, getRouterParams(event, { decode: true }))
  const body = validateInput(updateSaleBodySchema, await readBody(event))
  return updateSale(ctx.db, id, body)
})
