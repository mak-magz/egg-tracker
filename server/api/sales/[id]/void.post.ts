// POST /api/sales/:id/void (§3.3, AC67, AC68 -- owner correction, 2026-09-27): voids a COMPLETE sale, one-way.
// Every line's eggs go back on hand from that moment on; the row, its number and every line stay exactly as they
// were, marked Voided. Never a shortfall check (voiding only ever gives eggs back). A Pending sale is refused
// (TM042 -> 409 not_complete): Void isn't offered on one; it's only ever deleted (AC44).
// 200 VoidSaleResponse (`changed: false` if already voided) | 400 validation_failed (version) | 404 not_found |
// 409 conflict sale_changed (+ sale) or not_complete (+ sale) | 401 | 403 | 500.
import { getRouterParams, readBody } from 'h3'
import { saleIdParamsSchema, voidSaleBodySchema } from '../../../../shared/schemas/sales'
import type { VoidSaleResponse } from '../../../../shared/types/api'
import { voidSale } from '../../../repositories/sales'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<VoidSaleResponse> => {
  const { id } = validateInput(saleIdParamsSchema, getRouterParams(event, { decode: true }))
  const body = validateInput(voidSaleBodySchema, await readBody(event))
  return voidSale(ctx.db, id, body)
})
