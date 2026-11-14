/* eslint-disable @typescript-eslint/no-explicit-any */
// `$api`: the only way later features call our server routes (§3.8). A 401 from any of them means the
// session is gone, so it runs the session-expired flow (AC11). On the server it forwards the cookies.
// In Feature 08 (Offline-first), on the client data routes are routed to the local SQLite WASM worker
// via `localRouter`.
import { useAuthActions } from '../composables/useAuthActions'
import { localRouter } from '../local/router'

export default defineNuxtPlugin((nuxtApp) => {
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

  // Helper to extract clean pathname from string, URL, or Request
  function extractPathname(request: any): string {
    if (!request) return ''
    if (typeof request === 'string') {
      try {
        return new URL(request, 'http://localhost').pathname
      }
      catch {
        return request.split('?')[0] || ''
      }
    }
    if (request instanceof URL) {
      return request.pathname
    }
    if (typeof Request !== 'undefined' && request instanceof Request) {
      try {
        return new URL(request.url, 'http://localhost').pathname
      }
      catch {
        return request.url.split('?')[0] || ''
      }
    }
    return String(request).split('?')[0] || ''
  }

  function isCloudRoute(path: string): boolean {
    return (
      path.startsWith('/api/auth/')
      || path.startsWith('/api/account/upgrade')
      || path.startsWith('/api/sync/')
      || path.startsWith('/api/__session')
      || path.startsWith('/api/admin/')
    )
  }

  function isDataRoute(path: string): boolean {
    return path.startsWith('/api/') && !isCloudRoute(path)
  }

  // Base network fetch for cloud routes or SSR
  const networkApi = $fetch.create({
    headers,
    retry: 0,
    async onResponseError({ request, response }) {
      if (import.meta.client && response?.status === 401) {
        const path = extractPathname(request)
        if (path.startsWith('/api/admin/')) {
          return
        }
        const router = (nuxtApp as any).$router
        const routePath = router?.currentRoute?.value?.path || ''
        if (routePath.startsWith('/admin') || routePath.startsWith('/login/admin')) {
          return
        }
        await nuxtApp.runWithContext(() => useAuthActions().handleSessionExpired())
      }
    },
  })

  // The unified apiFetch function that routes data requests locally on client
  function createUnifiedFetch(baseFetch: any = networkApi): typeof $fetch {
    const fetchHandler: any = async (request: any, opts: any = {}) => {
      if (import.meta.client) {
        const path = extractPathname(request)
        if (isDataRoute(path)) {
          const result = await localRouter.dispatch(request, opts)
          const method = String(opts?.method || 'GET').toUpperCase()
          if (method !== 'GET') {
            try {
              const { syncEngine } = await import('../local/sync')
              void syncEngine.triggerSync().catch(() => {})
            }
            catch {
              // ignore
            }
          }
          return result
        }
      }
      return await baseFetch(request, opts)
    }

    fetchHandler.raw = baseFetch.raw
    fetchHandler.native = baseFetch.native
    fetchHandler.create = (defaults: any = {}) => {
      const created = baseFetch.create(defaults)
      return createUnifiedFetch(created)
    }

    return fetchHandler as unknown as typeof $fetch
  }

  const apiFetch = createUnifiedFetch(networkApi)

  if (import.meta.client) {
    globalThis.$fetch = apiFetch as any
    nuxtApp.$fetch = apiFetch

    const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
    const isAdminPath = currentPath.startsWith('/admin') || currentPath.startsWith('/login/admin')

    if (!isAdminPath) {
      const { ensure, me } = useMe()
      if (!me.value) {
        void ensure().catch((err) => {
          console.warn('[api-plugin] Failed to initialize local farm on startup:', err)
        })
      }
    }
  }

  return {
    provide: {
      api: apiFetch,
    },
  }
})
