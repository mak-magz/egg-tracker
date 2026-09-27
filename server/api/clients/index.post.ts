// POST /api/clients (§3.3): adds a client. Idempotent per submissionId: a replay returns the first client with
// `replayed: true` and never fails as "already exists" (AC15).
// 200 AddClientResponse | 400 validation_failed (name, phone, defaultPrice, submissionId) |
// 409 conflict name_taken (+ existing) or client_limit | 401 | 403 | 500.
import { readBody } from 'h3'
import { addClientBodySchema } from '../../../shared/schemas/clients'
import type { AddClientResponse } from '../../../shared/types/api'
import { addClient } from '../../repositories/clients'
import { validateInput } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (event, ctx): Promise<AddClientResponse> => {
  const body = validateInput(addClientBodySchema, await readBody(event))
  return addClient(ctx.db, body)
})
