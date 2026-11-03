export default defineNuxtRouteMiddleware(async (to) => {
  // 1. Verify user authentication session (wait for Firebase to restore session if initializing)
  const auth = useFirebaseAuth()
  if (auth && typeof auth.authStateReady === 'function') {
    await auth.authStateReady()
  }
  const user = auth?.currentUser

  if (!user) {
    // Redirect unauthenticated user to dedicated admin login with return path
    return navigateTo(`/admin/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  // 2. Verify admin clearance via API probe
  const admin = useAdmin()
  const check = await admin.checkAccess()
  if (!check.ok) {
    if (check.reason === 'unauthenticated') {
      return navigateTo(`/admin/login?redirect=${encodeURIComponent(to.fullPath)}`)
    }
    if (check.reason === 'forbidden') {
      // AC3: 403 Forbidden - non-admin access denial state
      admin.accessDenied.value = true
    }
  }
  else {
    admin.accessDenied.value = false
  }
})
