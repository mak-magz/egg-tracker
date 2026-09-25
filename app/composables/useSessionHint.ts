// The "had a session on this device" hint (§3.5, D10). Not sensitive: it only decides whether a
// redirect to sign-in says "Your session has expired" (hint set) or nothing (first visit / signed out).
// Set after a successful sign-in or password reset; cleared only by an explicit sign-out.
export const SESSION_HINT_COOKIE = 'tamago_had_session'

export function useSessionHint() {
  return useCookie<string | null>(SESSION_HINT_COOKIE, {
    default: () => null,
    maxAge: 60 * 60 * 24 * 400,
    sameSite: 'lax',
    path: '/',
    secure: !import.meta.dev,
  })
}
