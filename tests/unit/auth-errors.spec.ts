import { describe, expect, it } from 'vitest'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import {
  mapAuthError,
  mapResetRequestError,
  mapUpdatePasswordError,
  mapVerifyRecoveryError,
} from '../../app/utils/auth-errors'

describe('mapAuthError', () => {
  it('maps wrong email or password to invalid_credentials (same for unknown emails, AC3)', () => {
    expect(mapAuthError(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe('invalid_credentials')
    expect(mapAuthError(new AuthApiError('Invalid login credentials', 400, undefined))).toBe('invalid_credentials')
  })

  it('maps no connection to network (AC6)', () => {
    expect(mapAuthError(new AuthRetryableFetchError('Failed to fetch', 0))).toBe('network')
    expect(mapAuthError(new TypeError('Failed to fetch'))).toBe('network')
    expect(mapAuthError({ status: 0 })).toBe('network')
  })

  it('maps 429 and over_*_rate_limit to rate_limited', () => {
    expect(mapAuthError(new AuthApiError('Too many requests', 429, 'over_request_rate_limit'))).toBe('rate_limited')
    expect(mapAuthError({ status: 400, code: 'over_email_send_rate_limit' })).toBe('rate_limited')
  })

  it('maps anything else to unknown', () => {
    expect(mapAuthError(new AuthApiError('Email logins are disabled', 422, 'email_provider_disabled'))).toBe('unknown')
    expect(mapAuthError(new AuthApiError('boom', 500, 'unexpected_failure'))).toBe('unknown')
    expect(mapAuthError(null)).toBe('unknown')
    expect(mapAuthError('nope')).toBe('unknown')
  })
})

describe('mapResetRequestError', () => {
  it('distinguishes network, rate-limit and unknown', () => {
    expect(mapResetRequestError(new AuthRetryableFetchError('Failed to fetch', 0))).toBe('network')
    expect(mapResetRequestError(new AuthApiError('wait', 429, 'over_email_send_rate_limit'))).toBe('rate_limited')
    expect(mapResetRequestError(new AuthApiError('boom', 500, 'unexpected_failure'))).toBe('unknown')
  })
})

describe('mapUpdatePasswordError', () => {
  it('maps weak/same password and 422 to weak_password', () => {
    expect(mapUpdatePasswordError(new AuthApiError('weak', 422, 'weak_password'))).toBe('weak_password')
    expect(mapUpdatePasswordError(new AuthApiError('same', 422, 'same_password'))).toBe('weak_password')
    expect(mapUpdatePasswordError(new TypeError('Failed to fetch'))).toBe('network')
    expect(mapUpdatePasswordError(new AuthApiError('boom', 500, 'unexpected_failure'))).toBe('unknown')
  })
})

describe('mapVerifyRecoveryError', () => {
  it('shows expired for expired, used or invalid links, network for no connection', () => {
    expect(mapVerifyRecoveryError(new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'))).toBe('expired')
    expect(mapVerifyRecoveryError(new AuthApiError('bad', 400, 'validation_failed'))).toBe('expired')
    expect(mapVerifyRecoveryError(new AuthRetryableFetchError('Failed to fetch', 0))).toBe('network')
  })
})
