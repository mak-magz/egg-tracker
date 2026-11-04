import type { AdminMetricsResponse } from '~/composables/useAdmin'

export default defineNuxtRouteMiddleware(async (to) => {
  // Allow dedicated admin login page to render without clearance check
  if (to.path === '/admin/login') {
    return
  }

  // ==========================================
  // 1. Server-Side SSR Execution (Nitro)
  // ==========================================
  if (import.meta.server) {
    const sessionCookie = useCookie('__session').value
    if (!sessionCookie) {
      return navigateTo(`/admin/login?redirect=${encodeURIComponent(to.fullPath)}`, {
        redirectCode: 302,
      })
    }

    // SSR internal probe to verify operator clearance via Control DB
    const requestFetch = useRequestFetch()
    try {
      const res = await requestFetch<AdminMetricsResponse>('/api/admin/metrics')
      const admin = useAdmin()
      admin.metrics.value = res
      admin.accessDenied.value = false
    }
    catch (err: unknown) {
      const e = err as { statusCode?: number }
      if (e?.statusCode === 401) {
        return navigateTo(`/admin/login?redirect=${encodeURIComponent(to.fullPath)}`, {
          redirectCode: 302,
        })
      }
      if (e?.statusCode === 403) {
        // Authenticated user lacks operator clearance: render 403 denial screen on server
        const admin = useAdmin()
        admin.accessDenied.value = true
        const event = useRequestEvent()
        if (event) {
          setResponseStatus(event, 403)
        }
        return
      }
      throw err
    }
    return
  }

  // ==========================================
  // 2. Client-Side SPA Execution
  // ==========================================
  const auth = useFirebaseAuth()
  if (auth && typeof auth.authStateReady === 'function') {
    await auth.authStateReady()
  }
  const user = auth?.currentUser
  if (!user) {
    return navigateTo(`/admin/login?redirect=${encodeURIComponent(to.fullPath)}`, {
      replace: true,
    })
  }

  const admin = useAdmin()
  const check = await admin.checkAccess()
  if (!check.ok) {
    if (check.reason === 'unauthenticated') {
      return navigateTo(`/admin/login?redirect=${encodeURIComponent(to.fullPath)}`, {
        replace: true,
      })
    }
    if (check.reason === 'forbidden') {
      admin.accessDenied.value = true
    }
  }
  else {
    admin.accessDenied.value = false
  }
})
