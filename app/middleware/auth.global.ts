// Route guard (§3.8, D11, Feature 08 AC1).
// Level comes from definePageMeta({ auth }); the default is 'farm'.
// Unauthenticated users have instant access to local offline farm by default.
// Only explicit 'cloud' or 'account' routes require authentication.
import { signOut as firebaseSignOut } from 'firebase/auth'
import { safeReturnTo } from '#shared/utils/return-to'

export default defineNuxtRouteMiddleware(async (to) => {
  const level = to.meta.auth ?? 'farm'
  const user = await getCurrentUser()
  const hint = useSessionHint()
  const { me, ensure } = useMe()

  // 1. Signed-in users should not access /welcome
  if (user && to.path === '/welcome') {
    return navigateTo('/production', { replace: true })
  }

  // 2. Routes requiring cloud accounts (e.g. sync setup, account upgrade management)
  const requiresCloudAccount = level === 'user'
  if (!user && requiresCloudAccount) {
    return navigateTo(loginLocation(to.fullPath, !!hint.value))
  }

  // 3. Unauthenticated Free / Offline mode (AC1 + Onboarding):
  if (!user) {
    const onboardedCookie = useCookie('tamago_onboarded')
    const hasCompletedOnboarding = onboardedCookie.value === 'true' || me.value?.farm?.onboardingCompleted === true

    if (to.path === '/welcome') {
      if (hasCompletedOnboarding) {
        return navigateTo('/production', { replace: true })
      }
      return
    }

    if (level === 'guest' || level === 'public') {
      return
    }

    if (!hasCompletedOnboarding) {
      return navigateTo('/welcome')
    }

    // On the client, initialize local farm settings and default sizes into `me.value`
    if (import.meta.client) {
      await ensure()
    }
    // Allow through to all farm routes barnside without login prompt
    return
  }

  // 3. Authenticated session check
  const result = await ensure()

  if (result === 'unauthenticated') {
    const auth = useFirebaseAuth()
    if (auth) await firebaseSignOut(auth).catch(() => {})
    if (requiresCloudAccount) {
      return navigateTo(loginLocation(to.fullPath, true))
    }
    return
  }

  // 4. Signed-in users should not see sign-in / forgot-password
  if (level === 'guest') {
    if (result === 'ready' && !me.value?.farm) {
      return navigateTo('/no-farm', { replace: true })
    }
    return navigateTo(safeReturnTo(to.query.redirect) ?? '/', { replace: true })
  }

  // 5. Cloud Farm Gating
  if (result === 'error') return
  if (requiresCloudAccount && !me.value?.farm) {
    return navigateTo('/no-farm', { replace: true })
  }
})
