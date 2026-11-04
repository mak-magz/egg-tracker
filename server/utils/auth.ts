// Identity and tenant resolution for server routes (docs/features/00-project-scaffold.md §3.4).
// The tenant ALWAYS comes from the signed-in user's membership, never from the request (AC23).
// Verifies the Firebase session cookie (`__session`) or `Authorization: Bearer <idToken>` via Firebase Admin Auth,
// then looks up the user's membership and farm in the Turso Control DB + Tenant DB.
import { getCookie, getRequestHeader } from 'h3'
import type { H3Event } from 'h3'
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import type { App as AdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import type { FarmSummary } from '../../shared/types/api'
import { findMembershipWithFarm } from '../repositories/memberships'
import type { MembershipWithFarm } from '../repositories/memberships'
import { findAdminByUserId, upsertAdminUser } from '../repositories/admin-users'
import { apiError } from './errors'

// Bridge FIREBASE_SERVICE_ACCOUNT into GOOGLE_APPLICATION_CREDENTIALS if omitted,
// enabling nuxt-vuefire's session cookie minter (/api/__session) to authenticate on Vercel.
if (typeof process !== 'undefined' && process.env) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.FIREBASE_SERVICE_ACCOUNT) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.FIREBASE_SERVICE_ACCOUNT
  }
}

export interface AuthContext {
  userId: string
  email: string
}

export interface TenantContext extends AuthContext {
  tenantId: string
  farm: FarmSummary
}

// Admin routes operate across the fleet; tenantId is NOT bound to the context.
export type AdminContext = AuthContext

declare module 'h3' {
  interface H3EventContext {
    /** Per-request caches (promises, so concurrent callers share one lookup). */
    tamagoAuth?: Promise<AuthContext | null>
    tamagoMembership?: Promise<MembershipWithFarm | null>
    tamagoAdmin?: Promise<AdminContext>
  }
}

/** Only the name and code of an error, never its message or details. */
function safeErrorId(e: unknown): string {
  const o = (e ?? {}) as { name?: unknown, code?: unknown }
  return `${typeof o.name === 'string' ? o.name : 'unknown'} ${typeof o.code === 'string' ? o.code : 'unknown'}`
}

export function isTransientAuthFailure(error: { status?: number, code?: string, name?: string } | null): boolean {
  if (!error) return false
  if (error.name === 'AuthRetryableFetchError') return true
  if (error.code === 'auth/internal-error' || error.code === 'auth/network-request-failed') return true
  const status = error.status ?? 0
  return status === 0 || status === 429 || status >= 500
}

function getOrInitAdminApp(event: H3Event): AdminApp {
  if (process.env.NODE_ENV !== 'production' && !process.env.FIREBASE_SERVICE_ACCOUNT?.trim() && !process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'
  }
  if (
    event.context?.firebaseApp
    && (!('options' in event.context.firebaseApp) || Boolean(event.context.firebaseApp.options?.projectId))
  ) {
    return event.context.firebaseApp
  }
  const existing = getApps().find(app => !('options' in app) || Boolean(app.options?.projectId))
  if (existing) return existing

  const rawServiceAccount = (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS)?.trim()
  const projectId = process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || 'demo-no-project'

  if (rawServiceAccount && rawServiceAccount.startsWith('{')) {
    return initializeApp({
      credential: cert(JSON.parse(rawServiceAccount)),
      projectId,
    }, 'tamago-admin')
  }
  return initializeApp({ projectId }, 'tamago-admin')
}

async function resolveAuth(event: H3Event): Promise<AuthContext | null> {
  const sessionCookie = getCookie(event, '__session')
  const authHeader = getRequestHeader(event, 'authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!sessionCookie && !bearerToken) {
    return null
  }

  try {
    const adminApp = getOrInitAdminApp(event)
    const adminAuth = getAdminAuth(adminApp)
    // checkRevoked = true ensures revoked sessions (e.g. from `provision reset-password`) are rejected immediately.
    const decoded = sessionCookie
      ? await adminAuth.verifySessionCookie(sessionCookie, true)
      : await adminAuth.verifyIdToken(bearerToken!, true)

    if (!decoded.uid) return null
    return { userId: decoded.uid, email: decoded.email ?? '' }
  }
  catch (e) {
    const code = (e as { code?: string })?.code ?? ''
    if (
      code.startsWith('auth/session-cookie-')
      || code.startsWith('auth/id-token-')
      || code === 'auth/argument-error'
      || code === 'auth/user-not-found'
      || code === 'auth/user-disabled'
    ) {
      return null
    }
    console.error('[auth] token verification failed', safeErrorId(e))
    throw apiError(500, 'internal')
  }
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
  event.context.tamagoMembership ??= findMembershipWithFarm(auth.userId)
  return event.context.tamagoMembership
}

/** Signed in AND a member of a farm; 401 `unauthenticated` / 403 `no_farm` otherwise. */
export async function requireTenant(event: H3Event): Promise<TenantContext> {
  const auth = await requireAuth(event)
  const membership = await getMembership(event)
  if (!membership) throw apiError(403, 'no_farm')
  return { ...auth, tenantId: membership.tenantId, farm: membership.farm }
}

export function getFirebaseAdminAuth(event?: H3Event) {
  const adminApp = getOrInitAdminApp(event || ({} as H3Event))
  return getAdminAuth(adminApp)
}

/** Enforces verified Firebase Auth and platform operator authorization via Control DB admins table (with ADMIN_EMAILS fallback). */
export function requireAdmin(event: H3Event): Promise<AdminContext> {
  if (event.context.tamagoAdmin) {
    return event.context.tamagoAdmin
  }

  const promise = (async () => {
    const auth = await requireAuth(event)
    const adminRecord = await findAdminByUserId(auth.userId)

    if (adminRecord) {
      if (adminRecord.isActive) {
        return auth
      }
      throw apiError(403, 'forbidden')
    }

    const adminEmailsRaw = process.env.ADMIN_EMAILS?.trim() || ''
    const adminEmails = adminEmailsRaw
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)

    const userEmail = (auth.email || '').toLowerCase()
    if (userEmail && adminEmails.includes(userEmail)) {
      await upsertAdminUser(auth.userId, userEmail, 'superadmin')
      return auth
    }

    throw apiError(403, 'forbidden')
  })()

  event.context.tamagoAdmin = promise
  return promise
}
