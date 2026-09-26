// PUT /api/sizes/order (§3.3): applies the wanted FULL order of the active sizes, and names the size that moved.
// Safe to retry: the same order is a no-op, and a stale list is refused rather than applied as a wrong move.
// 200 SizeChangeResponse (changedId = sizeId) | 400 validation_failed (order) | 409 conflict sizes_changed (+ sizes) | 401 | 403 | 500.
import { readBody } from 'h3'
import { reorderSizesBodySchema } from '../../../shared/schemas/sizes'
import type { SizeChangeResponse } from '../../../shared/types/api'
import { reorderSizes } from '../../repositories/sizes'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<SizeChangeResponse> => {
  const body = validateInput(reorderSizesBodySchema, await readBody(event))
  return reorderSizes(ctx.db, body)
})
