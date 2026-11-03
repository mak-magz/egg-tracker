import { getFleetMigrationStatus } from '../../../repositories/admin-migrations'
import { defineAdminHandler } from '../../../utils/handlers'

export default defineAdminHandler(async () => {
  return await getFleetMigrationStatus()
})
