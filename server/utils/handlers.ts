// Every route in server/api/ must be wrapped in one of these (enforced by tests/unit/server-guards.spec.ts).
// Both: set `Cache-Control: private, no-store`, refuse cross-site writes (`assertRequestAllowed`), resolve identity
// from the session (never from input), and map anything thrown to an ApiErrorData error.
import { defineEventHandler, getRequestHeaders, setResponseHeader } from 'h3'
import type { EventHandlerRequest, H3Event } from 'h3'
import { requireAdmin, requireAuth, requireTenant } from './auth'
import type { AdminContext, AuthContext, TenantContext } from './auth'
import { createTenantDb } from './db'
import type { TenantDb } from './db'
import { apiError, toApiError } from './errors'
import { checkRequest, requestHasBody } from './request-guard'

export interface TenantHandlerContext extends TenantContext {
  db: TenantDb
}

function noStore(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
}

/**
 * CSRF second layer (security audit L1), before any auth or database work, for every route: a request a browser
 * marks as cross-site (Sec-Fetch-Site or Origin) is a 403 with code `no_farm` (the only 403 code in the API
 * contract; no fields, no data), and a write with a body that isn't `application/json` is a 400
 * `validation_failed`. A header the caller doesn't send never blocks (curl, scripts, the CLI, server-side calls).
 * The decision itself is `checkRequest` (pure, unit-tested).
 */
function assertRequestAllowed(event: H3Event) {
  const headers = getRequestHeaders(event)
  const verdict = checkRequest({
    method: event.method,
    secFetchSite: headers['sec-fetch-site'],
    origin: headers.origin,
    hosts: [headers.host, headers['x-forwarded-host']],
    contentType: headers['content-type'],
    hasBody: requestHasBody(headers['content-length'], headers['transfer-encoding']),
  })
  if (verdict === 'cross_site') throw apiError(403, 'no_farm')
  if (verdict === 'not_json') throw apiError(400, 'validation_failed')
}

/** Signed in; farm optional (only `/api/me` needs this). 401 `unauthenticated` when there's no valid session. */
export function defineAuthedHandler<T>(
  fn: (event: H3Event<EventHandlerRequest>, ctx: AuthContext) => T | Promise<T>,
) {
  return defineEventHandler(async (event) => {
    noStore(event)
    try {
      assertRequestAllowed(event)
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
      assertRequestAllowed(event)
      const tenant = await requireTenant(event)
      const db = await createTenantDb(event, tenant.tenantId)
      return await fn(event, { ...tenant, db })
    }
    catch (e) {
      throw toApiError(e)
    }
  })
}

/**
 * Signed in AND verified operator email in ADMIN_EMAILS (all /api/admin/** routes).
 * 401 `unauthenticated` / 403 `forbidden`.
 */
export function defineAdminHandler<T>(
  fn: (event: H3Event<EventHandlerRequest>, ctx: AdminContext) => T | Promise<T>,
) {
  return defineEventHandler(async (event) => {
    noStore(event)
    try {
      assertRequestAllowed(event)
      const ctx = await requireAdmin(event)
      return await fn(event, ctx)
    }
    catch (e) {
      throw toApiError(e)
    }
  })
}

/**
 * Unauthenticated entrypoint for operator login (POST /api/admin/login).
 * Enforces CSRF assertRequestAllowed and noStore.
 */
export function defineAdminLoginHandler<T>(
  fn: (event: H3Event<EventHandlerRequest>) => T | Promise<T>,
) {
  return defineEventHandler(async (event) => {
    noStore(event)
    try {
      assertRequestAllowed(event)
      return await fn(event)
    }
    catch (e) {
      throw toApiError(e)
    }
  })
}
