import { getRouterParam } from 'h3'
import { getTenantSyncIssues } from '../../../../../repositories/admin-sync'
import { apiError } from '../../../../../utils/errors'
import { defineAdminHandler } from '../../../../../utils/handlers'

export default defineAdminHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, 'validation_failed')

  return await getTenantSyncIssues(id)
})
