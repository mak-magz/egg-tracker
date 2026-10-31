// Route guard (§3.8, D11). Runs on SSR too, so redirects are 302s and no farm content flashes (AC9).
// Level comes from definePageMeta({ auth }); the default is 'farm' (deny by default).
import { signOut as firebaseSignOut } from 'firebase/auth'
import { safeReturnTo } from '#shared/utils/return-to'

export default defineNuxtRouteMiddleware(async (to) => {
  const level = to.meta.auth ?? 'farm'
  const user = await getCurrentUser()
  const hint = useSessionHint()
  const { me, ensure } = useMe()
  const needsUser = level === 'farm' || level === 'user'

  // 1–2. Signed out.
  if (!user) {
    if (needsUser) return navigateTo(loginLocation(to.fullPath, !!hint.value))
    return
  }

  // 3. Signed in: who and which farm (cached after the first call).
  const result = await ensure()

  if (result === 'unauthenticated') {
    // The cookie had a session the server no longer accepts (revoked or expired): end it here.
    const auth = useFirebaseAuth()
    if (auth) await firebaseSignOut(auth).catch(() => {})
    if (needsUser) return navigateTo(loginLocation(to.fullPath, true))
    return
  }

  // 4. Signed-in users don't see sign-in / forgot-password.
  if (level === 'guest') {
    if (result === 'ready' && !me.value?.farm) return navigateTo('/no-farm', { replace: true })
    return navigateTo(safeReturnTo(to.query.redirect) ?? '/', { replace: true })
  }

  // 6. /api/me failed (network/500): let the page render; the layout shows "Couldn't load your farm."
  if (result === 'error') return

  // 5. Farm gating.
  if (level === 'farm' && !me.value?.farm) return navigateTo('/no-farm', { replace: true })
  if (level === 'user' && me.value?.farm) return navigateTo('/', { replace: true })
})
