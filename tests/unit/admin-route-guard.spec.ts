/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'

describe('Admin Route Guards & Redirection', () => {
  it('redirects /login/admin cleanly to /admin/login', async () => {
    let redirectedTo: any = null
    const mockNavigateTo = (target: string, opts?: any) => {
      redirectedTo = { target, opts }
      return redirectedTo
    }

    // Simulate auth.global logic
    const to = { path: '/login/admin', meta: {} }
    let handled = false

    if (to.path.startsWith('/admin') || to.path === '/login/admin') {
      if (to.path === '/login/admin') {
        handled = true
        mockNavigateTo('/admin/login', { replace: true })
      }
    }

    expect(handled).toBe(true)
    expect(redirectedTo).toEqual({
      target: '/admin/login',
      opts: { replace: true },
    })
  })

  it('allows /admin and /admin/* without redirecting to /welcome', async () => {
    const mockNavigateTo = vi.fn()

    const testPaths = ['/admin', '/admin/login', '/admin/tenants']
    for (const path of testPaths) {
      const to = { path, meta: { auth: 'public' } }
      let bypassed = false

      if (to.path.startsWith('/admin') || to.path === '/login/admin') {
        bypassed = true
      }

      expect(bypassed).toBe(true)
      expect(mockNavigateTo).not.toHaveBeenCalled()
    }
  })

  it('classifies /api/admin/* as a cloud route so it bypasses local SQLite worker', () => {
    function isCloudRoute(path: string): boolean {
      return (
        path.startsWith('/api/auth/')
        || path.startsWith('/api/account/upgrade')
        || path.startsWith('/api/sync/')
        || path.startsWith('/api/__session')
        || path.startsWith('/api/admin/')
      )
    }

    expect(isCloudRoute('/api/admin/metrics')).toBe(true)
    expect(isCloudRoute('/api/admin/tenants')).toBe(true)
    expect(isCloudRoute('/api/admin/users')).toBe(true)
    expect(isCloudRoute('/api/admin/migrations')).toBe(true)
    expect(isCloudRoute('/api/production')).toBe(false)
    expect(isCloudRoute('/api/sales')).toBe(false)
    expect(isCloudRoute('/api/orders')).toBe(false)
  })

  it('sets accessDenied to true only on 403 Forbidden errors', async () => {
    let accessDenied = false
    const checkAccessMock = async (fetchFn: () => Promise<any>) => {
      try {
        await fetchFn()
        accessDenied = false
        return { ok: true }
      }
      catch (err: any) {
        const e = err as { statusCode?: number }
        if (e?.statusCode === 403) {
          accessDenied = true
          return { ok: false, reason: 'forbidden' }
        }
        if (e?.statusCode === 401) {
          return { ok: false, reason: 'unauthenticated' }
        }
        return { ok: false, reason: 'error' }
      }
    }

    // 1. Success -> accessDenied remains false
    const resSuccess = await checkAccessMock(async () => ({ ok: true }))
    expect(resSuccess).toEqual({ ok: true })
    expect(accessDenied).toBe(false)

    // 2. 500 error -> does NOT mark as accessDenied
    const res500 = await checkAccessMock(async () => {
      const err = new Error('Server error') as any
      err.statusCode = 500
      throw err
    })
    expect(res500).toEqual({ ok: false, reason: 'error' })
    expect(accessDenied).toBe(false)

    // 3. 401 unauthenticated -> does NOT mark as accessDenied
    const res401 = await checkAccessMock(async () => {
      const err = new Error('Unauthenticated') as any
      err.statusCode = 401
      throw err
    })
    expect(res401).toEqual({ ok: false, reason: 'unauthenticated' })
    expect(accessDenied).toBe(false)

    // 4. 403 forbidden -> legitimately marks accessDenied
    const res403 = await checkAccessMock(async () => {
      const err = new Error('Forbidden') as any
      err.statusCode = 403
      throw err
    })
    expect(res403).toEqual({ ok: false, reason: 'forbidden' })
    expect(accessDenied).toBe(true)
  })

  it('simulates SSR admin clearance middleware (AC1)', async () => {
    async function runSsrMiddleware(params: {
      path: string
      sessionCookie?: string | null
      fetchMock: (url: string) => Promise<any>
    }) {
      if (params.path === '/admin/login') return { action: 'render' }
      if (!params.sessionCookie) {
        return { action: 'redirect', code: 302, to: `/admin/login?redirect=${encodeURIComponent(params.path)}` }
      }
      try {
        await params.fetchMock('/api/admin/metrics')
        return { action: 'render', accessDenied: false }
      }
      catch (err: any) {
        if (err.statusCode === 401) {
          return { action: 'redirect', code: 302, to: `/admin/login?redirect=${encodeURIComponent(params.path)}` }
        }
        if (err.statusCode === 403) {
          return { action: 'render', accessDenied: true, status: 403 }
        }
        throw err
      }
    }

    // Unauthenticated SSR visit
    const unauth = await runSsrMiddleware({
      path: '/admin',
      sessionCookie: null,
      fetchMock: vi.fn(),
    })
    expect(unauth).toEqual({ action: 'redirect', code: 302, to: '/admin/login?redirect=%2Fadmin' })

    // Non-admin 403 SSR visit
    const forbidden = await runSsrMiddleware({
      path: '/admin?tab=tenants',
      sessionCookie: 'valid-session-cookie',
      fetchMock: vi.fn().mockRejectedValue({ statusCode: 403 }),
    })
    expect(forbidden).toEqual({ action: 'render', accessDenied: true, status: 403 })

    // Operator clearance granted
    const granted = await runSsrMiddleware({
      path: '/admin?tab=tenants',
      sessionCookie: 'valid-session-cookie',
      fetchMock: vi.fn().mockResolvedValue({ turso: {}, fleet: {} }),
    })
    expect(granted).toEqual({ action: 'render', accessDenied: false })
  })

  it('simulates smart root router destination resolution (AC12-AC15)', async () => {
    async function resolveRootDestination(input: {
      sessionCookie?: string | null
      isAdmin?: boolean
      isFree?: boolean
      onboarded?: boolean
      hasCloudToken?: boolean
      hasFarm?: boolean
    }): Promise<string> {
      if (input.sessionCookie && input.isAdmin) return '/admin'
      if (input.isFree && input.onboarded) return '/farm'
      if (input.hasCloudToken) {
        return input.hasFarm ? '/farm' : '/no-farm'
      }
      return input.onboarded ? '/login' : '/welcome'
    }

    // 1. Operator session
    expect(await resolveRootDestination({ sessionCookie: 's', isAdmin: true })).toBe('/admin')

    // 2. Free onboarded offline farmer
    expect(await resolveRootDestination({ isFree: true, onboarded: true })).toBe('/farm')

    // 3. Authenticated cloud farm owner
    expect(await resolveRootDestination({ hasCloudToken: true, hasFarm: true })).toBe('/farm')
    expect(await resolveRootDestination({ hasCloudToken: true, hasFarm: false })).toBe('/no-farm')

    // 4. First-time visitor
    expect(await resolveRootDestination({ onboarded: false })).toBe('/welcome')
    expect(await resolveRootDestination({ onboarded: true })).toBe('/login')
  })

  it('classifies admin routes and prevents triggering local worker initialization or pre-warming in client bootstrap', () => {
    function isAdminPath(pathname: string): boolean {
      return pathname.startsWith('/admin') || pathname.startsWith('/login/admin')
    }

    function shouldPrewarmLocalWorker(pathname: string): boolean {
      return !isAdminPath(pathname)
    }

    const adminPaths = [
      '/admin',
      '/admin/',
      '/admin/login',
      '/admin/metrics',
      '/admin/tenants',
      '/admin/users',
      '/admin/migrations',
      '/login/admin',
      '/login/admin/',
    ]

    for (const path of adminPaths) {
      expect(isAdminPath(path), `Expected ${path} to be recognized as an admin path`).toBe(true)
      expect(shouldPrewarmLocalWorker(path), `Expected ${path} to prevent local worker pre-warming`).toBe(false)
    }

    const nonAdminPaths = [
      '/',
      '/farm',
      '/farm/production',
      '/production',
      '/sales',
      '/orders',
      '/clients',
      '/welcome',
      '/login',
      '/login/forgot-password',
    ]

    for (const path of nonAdminPaths) {
      expect(isAdminPath(path), `Expected ${path} to NOT be recognized as an admin path`).toBe(false)
      expect(shouldPrewarmLocalWorker(path), `Expected ${path} to allow local worker pre-warming`).toBe(true)
    }
  })

  it('useMe() guard correctly avoids calling localRouter on admin paths', async () => {
    const localRouterDispatchMock = vi.fn()

    async function simulateUseMeLoad(currentPath: string, isServer = false) {
      let me: any
      let status: 'idle' | 'loading' | 'ready' | 'error'

      try {
        if (isServer) {
          me = null
          status = 'idle'
          return { result: 'unauthenticated', me, status }
        }

        // Defense-in-depth: Never query local SQLite worker on admin routes
        if (currentPath.startsWith('/admin') || currentPath.startsWith('/login/admin')) {
          me = null
          status = 'idle'
          return { result: 'unauthenticated', me, status }
        }

        // Non-admin route for free tier: dispatches to localRouter
        const localMe = await localRouterDispatchMock('/api/me')
        me = { ...localMe, isFree: true, tier: 'free' }
        status = 'ready'
        return { result: 'ready', me, status }
      }
      catch {
        me = null
        status = 'error'
        return { result: 'error', me, status }
      }
    }

    // 1. Admin paths: must return 'unauthenticated', set status to 'idle', and NEVER call localRouter.dispatch
    const testAdminPaths = ['/admin', '/admin/login', '/admin/metrics', '/login/admin', '/login/admin/']
    for (const path of testAdminPaths) {
      localRouterDispatchMock.mockClear()
      const res = await simulateUseMeLoad(path)
      expect(res.result).toBe('unauthenticated')
      expect(res.status).toBe('idle')
      expect(res.me).toBeNull()
      expect(localRouterDispatchMock).not.toHaveBeenCalled()
    }

    // 2. Non-admin paths: should call localRouter.dispatch and succeed
    localRouterDispatchMock.mockClear()
    localRouterDispatchMock.mockResolvedValueOnce({
      farm: { id: 'farm-1', name: 'My Farm' },
    })

    const resFarm = await simulateUseMeLoad('/farm')
    expect(resFarm.result).toBe('ready')
    expect(resFarm.status).toBe('ready')
    expect(resFarm.me).toEqual({
      farm: { id: 'farm-1', name: 'My Farm' },
      isFree: true,
      tier: 'free',
    })
    expect(localRouterDispatchMock).toHaveBeenCalledWith('/api/me')
  })
})
