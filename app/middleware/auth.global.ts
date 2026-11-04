// Route guard (§3.8, D11, Feature 08 AC1).
// Level comes from definePageMeta({ auth }); the default is 'farm'.
// Free users have instant access to local offline farm by default with ZERO network overhead.
// Only explicit 'cloud' or 'account' routes require authentication.
import { safeReturnTo } from '#shared/utils/return-to'
import { useTier } from '~/composables/useTier'
import { loginLocation } from '~/utils/login-location'

export default defineNuxtRouteMiddleware(async (to) => {
  // 0. Admin & Operator routes are completely separated from barnside farm onboarding
  if (to.path.startsWith('/admin') || to.path === '/login/admin') {
    if (to.path === '/login/admin') {
      return navigateTo('/admin/login', { replace: true })
    }
    return
  }

  const level = to.meta.auth ?? 'farm'
  const { isFree, getAuthToken } = useTier()
  const hint = useSessionHint()
  const { me, ensure } = useMe()

  // 1. Free / Offline mode (Feature 08 AC1 + Onboarding):
  if (isFree.value) {
    const onboardedCookie = useCookie('tamago_onboarded')
    const hasCompletedOnboarding = onboardedCookie.value === 'true' || me.value?.farm?.onboardingCompleted === true

    if (to.path === '/welcome') {
      if (hasCompletedOnboarding) {
        return navigateTo('/farm', { replace: true })
      }
      return
    }

    if (level === 'guest' || level === 'public') {
      return
    }

    if (!hasCompletedOnboarding) {
      return navigateTo('/welcome')
    }

    // Initialize local farm settings and default sizes into `me.value`
    await ensure()

    // Allow through to all farm routes barnside without login prompt or network calls
    return
  }

  // 2. Premium Cloud Tier
  const token = await getAuthToken()
  const requiresCloudAccount = level === 'user'

  if (!token && requiresCloudAccount) {
    return navigateTo(loginLocation(to.fullPath, !!hint.value))
  }

  if (token && to.path === '/welcome') {
    return navigateTo('/farm', { replace: true })
  }

  // 3. Settle session
  const result = await ensure()

  if (result === 'unauthenticated' && requiresCloudAccount) {
    return navigateTo(loginLocation(to.fullPath, true))
  }

  // 4. Signed-in users should not see sign-in / forgot-password
  if (level === 'guest' && token) {
    if (result === 'ready' && !me.value?.farm) {
      return navigateTo('/no-farm', { replace: true })
    }
    return navigateTo(safeReturnTo(to.query.redirect) ?? '/farm', { replace: true })
  }

  // 5. Cloud Farm Gating
  if (result === 'error') return
  if (requiresCloudAccount && !me.value?.farm) {
    return navigateTo('/no-farm', { replace: true })
  }
})
