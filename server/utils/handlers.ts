// Every route in server/api/ must be wrapped in one of these (enforced by tests/unit/server-guards.spec.ts).
// Both: set `Cache-Control: private, no-store`, resolve identity from the session (never from input),
// and map anything thrown to an ApiErrorData error.
import { defineEventHandler, setResponseHeader } from 'h3'
import type { EventHandlerRequest, H3Event } from 'h3'
import { requireAuth, requireTenant } from './auth'
import type { AuthContext, TenantContext } from './auth'
import { createTenantDb } from './db'
import type { TenantDb } from './db'
import { toApiError } from './errors'

export interface TenantHandlerContext extends TenantContext {
  db: TenantDb
}

function noStore(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
}

/** Signed in; farm optional (only `/api/me` needs this). 401 `unauthenticated` when there's no valid session. */
export function defineAuthedHandler<T>(
  fn: (event: H3Event<EventHandlerRequest>, ctx: AuthContext) => T | Promise<T>,
) {
  return defineEventHandler(async (event) => {
    noStore(event)
    try {
      const ctx = await requireAuth(event)
      return await fn(event, ctx)
    }
    catch (e) {
      throw toApiError(e)
    }
  })
}

/**
 * Signed in AND a member of a farm (every data route). 401 `unauthenticated` / 403 `no_farm`.
 * `ctx.db` is the tenant-scoped repository handle; `ctx.tenantId` comes from the membership only.
 */
export function defineTenantHandler<T>(
  fn: (event: H3Event<EventHandlerRequest>, ctx: TenantHandlerContext) => T | Promise<T>,
) {
  return defineEventHandler(async (event) => {
    noStore(event)
    try {
      const tenant = await requireTenant(event)
      const db = await createTenantDb(event, tenant.tenantId)
      return await fn(event, { ...tenant, db })
    }
    catch (e) {
      throw toApiError(e)
    }
  })
}
