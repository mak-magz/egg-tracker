// Where to send someone who needs to sign in (§3.5 "Session expired", "Return-to").
// `redirect` carries the screen they were on (AC10/AC11) only if it's a safe in-app path, and is
// omitted for the Dashboard (the default). `reason=expired` shows the session-expired banner.
import type { RouteLocationRaw } from 'vue-router'
import { safeReturnTo } from '#shared/utils/return-to'

export function loginLocation(fromFullPath: string | null, expired: boolean): RouteLocationRaw {
  if (fromFullPath?.startsWith('/admin')) {
    const redirect = safeReturnTo(fromFullPath)
    const query: Record<string, string> = {}
    if (redirect && redirect !== '/admin' && redirect !== '/admin/login') {
      query.redirect = redirect
    }
    return { path: '/admin/login', query }
  }

  const redirect = fromFullPath ? safeReturnTo(fromFullPath) : null
  const query: Record<string, string> = {}
  if (redirect && redirect !== '/') query.redirect = redirect
  if (expired) query.reason = 'expired'
  return { path: '/login', query }
}
