import { describe, expect, it, vi } from 'vitest'

vi.mock('#supabase/server', () => ({ serverSupabaseClient: vi.fn() }))

const { isTransientAuthFailure } = await import('../../server/utils/auth')

describe('isTransientAuthFailure', () => {
  it('treats a rate limit (429) as transient so the user stays signed in', () => {
    expect(isTransientAuthFailure({ status: 429 })).toBe(true)
  })
  it('treats 5xx and a missing status as transient', () => {
    expect(isTransientAuthFailure({ status: 503 })).toBe(true)
    expect(isTransientAuthFailure({})).toBe(true)
  })
  it('treats 401 and 403 as a bad session, and no error as fine', () => {
    expect(isTransientAuthFailure({ status: 401 })).toBe(false)
    expect(isTransientAuthFailure({ status: 403 })).toBe(false)
    expect(isTransientAuthFailure(null)).toBe(false)
  })
})
