// Identity and tenant resolution for server routes (docs/features/00-project-scaffold.md §3.4).
// The tenant ALWAYS comes from the signed-in user's membership, never from the request (AC23).
import type { H3Event } from 'h3'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { serverSupabaseClient } from '#supabase/server'
import type { FarmSummary } from '../../shared/types/api'
import { findMembershipWithFarm } from '../repositories/memberships'
import type { MembershipWithFarm } from '../repositories/memberships'
import { apiError } from './errors'

export interface AuthContext {
  userId: string
  email: string
}

export interface TenantContext extends AuthContext {
  tenantId: string
  farm: FarmSummary
}

declare module 'h3' {
  interface H3EventContext {
    /** Per-request caches (promises, so concurrent callers share one lookup). */
    tamagoAuth?: Promise<AuthContext | null>
    tamagoMembership?: Promise<MembershipWithFarm | null>
  }
}

/** Only the name and code of an error, never its message or details. */
function safeErrorId(e: unknown): string {
  const o = (e ?? {}) as { name?: unknown, code?: unknown }
  return `${typeof o.name === 'string' ? o.name : 'unknown'} ${typeof o.code === 'string' ? o.code : 'unknown'}`
}

export function isTransientAuthFailure(error: { status?: number } | null): boolean {
  if (!error) return false
  if (isAuthRetryableFetchError(error)) return true
  const status = error.status ?? 0
  return status === 0 || status === 429 || status >= 500
}

async function resolveAuth(event: H3Event): Promise<AuthContext | null> {
  const client = await serverSupabaseClient(event)
  let result: Awaited<ReturnType<typeof client.auth.getUser>>
  try {
    // getUser(), not getClaims(): Supabase signs JWTs with asymmetric keys (ES256, also on the local stack),
    // so getClaims() only verifies the signature locally and a revoked session (sign-out elsewhere,
    // `provision reset-password`) would keep working until the JWT expires (up to 1 h). getUser() asks
    // Auth, which rejects revoked sessions immediately. One Auth round trip per API request.
    // It refreshes an expired access token first (the new cookies are written to the response).
    result = await client.auth.getUser()
  }
  catch (e) {
    console.error('[auth] getUser threw', safeErrorId(e))
    throw apiError(500, 'internal')
  }
  const { data, error } = result
  if (error) {
    if (isTransientAuthFailure(error)) {
      console.error('[auth] auth service unreachable', error.status ?? 'unknown', safeErrorId(error))
      throw apiError(500, 'internal')
    }
    return null // no session, or an invalid, expired or revoked one
  }
  const user = data.user
  if (!user?.id || user.role !== 'authenticated') return null
  return { userId: user.id, email: user.email ?? '' }
}

/** The signed-in user, or null. Throws 500 `internal` only when Auth is unreachable. */
export function getAuthContext(event: H3Event): Promise<AuthContext | null> {
  event.context.tamagoAuth ??= resolveAuth(event)
  return event.context.tamagoAuth
}

/** The signed-in user, or 401 `unauthenticated`. */
export async function requireAuth(event: H3Event): Promise<AuthContext> {
  const auth = await getAuthContext(event)
  if (!auth) throw apiError(401, 'unauthenticated')
  return auth
}

/** The signed-in user's membership + farm, or null when they have none (AC12). */
export async function getMembership(event: H3Event): Promise<MembershipWithFarm | null> {
  const auth = await requireAuth(event)
  event.context.tamagoMembership ??= serverSupabaseClient(event).then(client => findMembershipWithFarm(client, auth.userId))
  return event.context.tamagoMembership
}

/** Signed in AND a member of a farm; 401 `unauthenticated` / 403 `no_farm` otherwise. */
export async function requireTenant(event: H3Event): Promise<TenantContext> {
  const auth = await requireAuth(event)
  const membership = await getMembership(event)
  if (!membership) throw apiError(403, 'no_farm')
  return { ...auth, tenantId: membership.tenantId, farm: membership.farm }
}
