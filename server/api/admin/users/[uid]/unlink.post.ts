import { getRouterParam } from 'h3'
import { unlinkUserFromFarm } from '../../../../repositories/admin-users'
import { apiError } from '../../../../utils/errors'
import { defineAdminHandler } from '../../../../utils/handlers'

export default defineAdminHandler(async (event, ctx) => {
  const uid = getRouterParam(event, 'uid')
  if (!uid) throw apiError(400, 'validation_failed')

  return await unlinkUserFromFarm(uid, ctx.email)
})
