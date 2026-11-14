import { getFleetSyncTelemetry } from '../../../repositories/admin-sync'
import { defineAdminHandler } from '../../../utils/handlers'

export default defineAdminHandler(async () => {
  return await getFleetSyncTelemetry()
})
