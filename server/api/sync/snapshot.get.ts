import { exportTenantSnapshot } from '../../repositories/sync'
import { defineTenantHandler } from '../../utils/handlers'

export default defineTenantHandler(async (_event, ctx) => {
  return await exportTenantSnapshot(ctx.db)
})
