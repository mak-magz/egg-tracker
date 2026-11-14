import { describe, expect, it } from 'vitest'
import { isAuthRoutePath, safeReturnTo } from '../../shared/utils/return-to'

describe('safeReturnTo', () => {
  it.each([
    ['/', '/'],
    ['/farm', '/farm'],
    ['/farm/production', '/farm/production'],
    ['/farm/sales?tab=pending#top', '/farm/sales?tab=pending#top'],
    ['/sales', '/sales'],
    ['/sales?tab=pending#top', '/sales?tab=pending#top'],
    ['/clients/abc-123', '/clients/abc-123'],
    ['/production/../sales', '/sales'],
    ['/loginx', '/loginx'],
    ['/authors', '/authors'],
  ])('accepts in-app path %s', (raw, expected) => {
    expect(safeReturnTo(raw)).toBe(expected)
  })

  it.each([
    // not a string / empty
    [undefined], [null], [42], [['/sales']], [{}], [''],
    // absolute and protocol-relative URLs
    ['https://evil.com'], ['http://evil.com/sales'], ['//evil.com'], ['//evil.com/sales'],
    ['///evil.com'], ['javascript:alert(1)'], ['data:text/html,x'], ['sales'], ['evil.com'],
    // backslash tricks (browsers treat \ as /)
    ['/\\evil.com'], ['\\\\evil.com'], ['/\\/evil.com'], ['/sales\\..\\x'],
    // control characters (URL parsers strip tab/newline, which would turn /\t/ into //)
    ['/\t/evil.com'], ['/\n/evil.com'], ['/\r/evil.com'], ['/sales\u0000'], ['/\u007F'],
    // auth routes (no redirect loops)
    ['/login'], ['/login?redirect=/sales'], ['/LOGIN'], ['/login/'], ['/forgot-password'],
    ['/no-farm'], ['/auth'], ['/auth/reset'], ['/auth/reset?token_hash=x&type=recovery'],
    ['/admin/login'], ['/admin/login?redirect=/admin'], ['/ADMIN/LOGIN'], ['/admin/login/'],
    ['/sales/../login'], ['/%2e%2e/login'], ['/%6Cogin'],
    // absurdly long
    [`/${'a'.repeat(3000)}`],
  ])('rejects %j', (raw) => {
    expect(safeReturnTo(raw)).toBeNull()
  })
})

describe('isAuthRoutePath', () => {
  it('matches auth routes only', () => {
    expect(isAuthRoutePath('/login')).toBe(true)
    expect(isAuthRoutePath('/admin/login')).toBe(true)
    expect(isAuthRoutePath('/auth/reset')).toBe(true)
    expect(isAuthRoutePath('/no-farm/')).toBe(true)
    expect(isAuthRoutePath('/')).toBe(false)
    expect(isAuthRoutePath('/farm')).toBe(false)
    expect(isAuthRoutePath('/farm/production')).toBe(false)
    expect(isAuthRoutePath('/sales')).toBe(false)
  })
})
