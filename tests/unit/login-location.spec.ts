import { describe, expect, it } from 'vitest'
import { loginLocation } from '../../app/utils/login-location'

describe('loginLocation', () => {
  it('returns /login for general farm screens', () => {
    expect(loginLocation('/farm', false)).toEqual({ path: '/login', query: { redirect: '/farm' } })
    expect(loginLocation('/farm/production', true)).toEqual({
      path: '/login',
      query: { redirect: '/farm/production', reason: 'expired' },
    })
    expect(loginLocation(null, true)).toEqual({ path: '/login', query: { reason: 'expired' } })
  })

  it('routes admin paths to /admin/login instead of farmer /login', () => {
    expect(loginLocation('/admin', true)).toEqual({ path: '/admin/login', query: {} })
    expect(loginLocation('/admin?tab=tenants', true)).toEqual({
      path: '/admin/login',
      query: { redirect: '/admin?tab=tenants' },
    })
    expect(loginLocation('/admin/login', true)).toEqual({ path: '/admin/login', query: {} })
  })
})
