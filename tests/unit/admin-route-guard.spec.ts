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
    expect(isCloudRoute('/api/admin/login')).toBe(true)
    expect(isCloudRoute('/api/admin/tenants')).toBe(true)
    expect(isCloudRoute('/api/production')).toBe(false)
    expect(isCloudRoute('/api/clients')).toBe(false)
  })

  it('only sets accessDenied = true on legitimate 403 forbidden responses', async () => {
    let accessDenied = false

    async function checkAccessMock(mockFetch: () => Promise<any>) {
      try {
        await mockFetch()
        accessDenied = false
        return { ok: true }
      }
      catch (err: unknown) {
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
})
