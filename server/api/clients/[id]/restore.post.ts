// POST /api/clients/:id/restore (§3.3): marks an inactive client active again. Already active is `changed: false`.
// 200 ClientChangeResponse | 400 validation_failed (id) | 404 not_found | 401 | 403 | 500.
import { getRouterParams } from 'h3'
import { clientIdParamsSchema } from '../../../../shared/schemas/clients'
import type { ClientChangeResponse } from '../../../../shared/types/api'
import { restoreClient } from '../../../repositories/clients'
import { validateInput } from '../../../utils/errors'
import { defineTenantHandler } from '../../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<ClientChangeResponse> => {
  const { id } = validateInput(clientIdParamsSchema, getRouterParams(event, { decode: true }))
  return restoreClient(ctx.db, id)
})
