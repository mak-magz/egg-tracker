import { getQuery } from 'h3'
import { listFirebaseUsers } from '../../../repositories/admin-users'
import { defineAdminHandler } from '../../../utils/handlers'

export default defineAdminHandler(async (event) => {
  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search : undefined

  return await listFirebaseUsers({ search })
})
