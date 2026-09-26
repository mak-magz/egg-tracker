// PATCH /api/sizes/:id (§3.3): renames an active size. The same name is a no-op.
// 200 SizeChangeResponse | 400 validation_failed (id, name) | 404 not_found (+ sizes) |
// 409 conflict sizes_changed (+ sizes) or name_taken (+ existing) | 401 | 403 | 500.
import { getRouterParams, readBody } from 'h3'
import { renameSizeBodySchema, sizeIdParamsSchema } from '../../../shared/schemas/sizes'
import type { SizeChangeResponse } from '../../../shared/types/api'
import { renameSize } from '../../repositories/sizes'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<SizeChangeResponse> => {
  const { id } = validateInput(sizeIdParamsSchema, getRouterParams(event, { decode: true }))
  const { name } = validateInput(renameSizeBodySchema, await readBody(event))
  return renameSize(ctx.db, id, name)
})
