// POST /api/clients/:id/archive (§3.3): marks a client inactive. Always allowed (AC34); nothing is deleted (AC21).
// Already inactive is `changed: false`, not an error.
// 200 ClientChangeResponse | 400 validation_failed (id) | 404 not_found | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { clientIdParamsSchema } from '../../../../shared/schemas/clients'
import type { ClientChangeResponse } from '../../../../shared/types/api'
import { archiveClient } from '../../../repositories/clients'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<ClientChangeResponse> => {
  const { id } = validateInput(clientIdParamsSchema, getRouterParams(event, { decode: true }))
  return archiveClient(ctx.db, id)
})
