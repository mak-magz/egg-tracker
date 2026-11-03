import { getQuery } from 'h3'
import { listAdminAuditLogs } from '../../repositories/admin-audit'
import { defineAdminHandler } from '../../utils/handlers'

export default defineAdminHandler(async (event) => {
  const query = getQuery(event)
  const page = query.page ? Number(query.page) : 1
  const limit = query.limit ? Number(query.limit) : 50
  const search = typeof query.query === 'string' ? query.query : undefined

  return await listAdminAuditLogs({ page, limit, query: search })
})
