// GET /api/clients (docs/features/03-clients.md §3.3): ALL of the farm's clients, active and inactive, in NO promised
// order (the browser sorts and searches: D7). The query string is ignored on purpose: the search text never leaves
// the browser (AC30). Fetched after the page mounts; never part of /api/me or the SSR payload (D10).
// 200 ClientsResponse | 401 | 403 | 500.
import type { ClientsResponse } from '../../../shared/types/api'
import { listClients } from '../../repositories/clients'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (_event, ctx): Promise<ClientsResponse> => {
  return { clients: await listClients(ctx.db) }
})
