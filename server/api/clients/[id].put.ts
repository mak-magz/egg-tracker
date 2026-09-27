// PUT /api/clients/:id (§3.3): REPLACES the client's name, phone and default price (null clears one). It carries the
// `version` the form was opened with (AC19). There is no DELETE route: a client is never deleted (AC21).
// 200 ClientChangeResponse (`changed: false` when nothing differed) | 400 validation_failed (id, name, phone,
// defaultPrice, version) | 404 not_found | 409 conflict client_changed (+ client) or name_taken (+ existing) |
// 401 | 403 | 500.
import { getRouterParams, readBody } from 'h3'
import { clientIdParamsSchema, updateClientBodySchema } from '../../../shared/schemas/clients'
import type { ClientChangeResponse } from '../../../shared/types/api'
import { updateClient } from '../../repositories/clients'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<ClientChangeResponse> => {
  const { id } = validateInput(clientIdParamsSchema, getRouterParams(event, { decode: true }))
  const body = validateInput(updateClientBodySchema, await readBody(event))
  return updateClient(ctx.db, id, body)
})
