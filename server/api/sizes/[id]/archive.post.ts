// POST /api/sizes/:id/archive (§3.3): retires a size. Nothing in production is touched.
// 200 SizeChangeResponse | 400 validation_failed (id) | 404 not_found (+ sizes) |
// 409 conflict last_active_size or sizes_changed (already archived), both with sizes | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { sizeIdParamsSchema } from '../../../../shared/schemas/sizes'
import type { SizeChangeResponse } from '../../../../shared/types/api'
import { archiveSize } from '../../../repositories/sizes'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<SizeChangeResponse> => {
  const { id } = validateInput(sizeIdParamsSchema, getRouterParams(event, { decode: true }))
  return archiveSize(ctx.db, id)
})
