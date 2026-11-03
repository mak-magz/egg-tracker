import { getAdminFleetMetrics } from '../../repositories/admin-tenants'
import { defineAdminHandler } from '../../utils/handlers'

export default defineAdminHandler(async () => {
  return await getAdminFleetMetrics()
})
