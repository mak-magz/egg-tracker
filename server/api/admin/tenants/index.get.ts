import { getQuery } from 'h3'
import { listAdminTenants } from '../../../repositories/admin-tenants'
import { defineAdminHandler } from '../../../utils/handlers'

export default defineAdminHandler(async (event) => {
  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search : undefined
  const tier = typeof query.tier === 'string' ? query.tier : undefined

  return await listAdminTenants({ search, tier })
})
