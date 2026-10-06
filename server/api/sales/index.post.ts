// POST /api/sales (§3.3): creates a sale (header + 1-20 lines) in one transaction. Idempotent per submissionId: a
// replay returns the first sale with `replayed: true` and never fails as "already exists" (AC30).
// 200 CreateSaleResponse | 400 validation_failed (type, clientId, saleDate, lines, submissionId) |
// 409 conflict stock_short (+ shortfall) | 401 | 403 | 500.
import { readBody } from 'h3'
import { createSaleBodySchema } from '../../../shared/schemas/sales'
import type { CreateSaleResponse } from '../../../shared/types/api'
import { createSale } from '../../repositories/sales'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<CreateSaleResponse> => {
  const body = validateInput(createSaleBodySchema, await readBody(event))
  return createSale(ctx.db, body)
})
