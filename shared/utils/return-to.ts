// Return-to path validation (AC10, AC11). Prevents open redirects: only same-app paths pass.
// Design: docs/features/00-project-scaffold.md §3.5 "Return-to".

const MAX_LENGTH = 2048
const BASE = 'http://x'
const AUTH_EXACT = new Set(['/login', '/forgot-password', '/no-farm', '/auth', '/admin/login'])

/** True for the auth screens, which must never be a post-sign-in destination. Case-insensitive, trailing slash ignored. */
export function isAuthRoutePath(pathname: string): boolean {
  let p = pathname.toLowerCase()
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return AUTH_EXACT.has(p) || p.startsWith('/auth/')
}

/**
 * Returns a safe in-app path (normalised pathname + search + hash) or null.
 * Accepts only a string that starts with a single `/`, has no backslashes or control characters,
 * resolves to the same origin, and isn't an auth route. Callers fall back to `/` on null.
 */
export function safeReturnTo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0 || raw.length > MAX_LENGTH) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  if (raw.includes('\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null

  let url: URL
  try {
    url = new URL(raw, BASE)
  }
  catch {
    return null
  }
  if (url.origin !== BASE) return null
  if (isAuthRoutePath(url.pathname)) return null
  // The router decodes percent-escapes, so check the decoded form too (e.g. /%6Cogin).
  try {
    if (isAuthRoutePath(decodeURIComponent(url.pathname))) return null
  }
  catch {
    return null
  }

  return `${url.pathname}${url.search}${url.hash}`
}
