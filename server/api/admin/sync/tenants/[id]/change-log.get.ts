import { getQuery, getRouterParam } from 'h3'
import { getTenantChangeLog } from '../../../../../repositories/admin-sync'
import { apiError } from '../../../../../utils/errors'
import { defineAdminHandler } from '../../../../../utils/handlers'

export default defineAdminHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, 'validation_failed')

  const query = getQuery(event)
  const page = query.page ? Number(query.page) : 1
  const limit = query.limit ? Number(query.limit) : 50
  const entityType = typeof query.entityType === 'string' ? query.entityType : undefined
  const deviceId = typeof query.deviceId === 'string' ? query.deviceId : undefined

  return await getTenantChangeLog(id, { page, limit, entityType, deviceId })
})
