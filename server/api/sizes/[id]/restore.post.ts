// POST /api/sizes/:id/restore (§3.3): brings an archived size back, last in the active list.
// 200 SizeChangeResponse | 400 validation_failed (id) | 404 not_found (+ sizes) |
// 409 conflict sizes_changed (+ sizes, not archived) | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { sizeIdParamsSchema } from '../../../../shared/schemas/sizes'
import type { SizeChangeResponse } from '../../../../shared/types/api'
import { restoreSize } from '../../../repositories/sizes'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<SizeChangeResponse> => {
  const { id } = validateInput(sizeIdParamsSchema, getRouterParams(event, { decode: true }))
  return restoreSize(ctx.db, id)
})
