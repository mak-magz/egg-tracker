// POST /api/sizes (§3.3): adds a size at the END of the active list. Idempotent per submissionId (AC18).
// 200 SizeChangeResponse | 400 validation_failed (name: blank, too long, 100-size cap; submissionId) |
// 409 conflict name_taken (+ existing) | 401 | 403 | 500.
import { readBody } from 'h3'
import { addSizeBodySchema } from '../../../shared/schemas/sizes'
import type { SizeChangeResponse } from '../../../shared/types/api'
import { addSize } from '../../repositories/sizes'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<SizeChangeResponse> => {
  const body = validateInput(addSizeBodySchema, await readBody(event))
  return addSize(ctx.db, body)
})
