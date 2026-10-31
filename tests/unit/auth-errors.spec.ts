import { describe, expect, it } from 'vitest'
import {
  mapAuthError,
  mapResetRequestError,
  mapUpdatePasswordError,
  mapVerifyRecoveryError,
} from '../../app/utils/auth-errors'

function authErr(message: string, status: number, code?: string) {
  return Object.assign(new Error(message), { name: 'AuthApiError', status, code })
}
function retryableErr(message: string, status: number) {
  return Object.assign(new Error(message), { name: 'AuthRetryableFetchError', status })
}
function firebaseErr(code: string, message = code) {
  return Object.assign(new Error(message), { name: 'FirebaseError', code })
}

describe('mapAuthError', () => {
  it('maps wrong email or password to invalid_credentials (same for unknown emails, AC3)', () => {
    expect(mapAuthError(firebaseErr('auth/invalid-credential'))).toBe('invalid_credentials')
    expect(mapAuthError(firebaseErr('auth/user-not-found'))).toBe('invalid_credentials')
    expect(mapAuthError(firebaseErr('auth/wrong-password'))).toBe('invalid_credentials')
    expect(mapAuthError(authErr('Invalid login credentials', 400, 'invalid_credentials'))).toBe('invalid_credentials')
    expect(mapAuthError(authErr('Invalid login credentials', 400, undefined))).toBe('invalid_credentials')
  })

  it('maps no connection to network (AC6)', () => {
    expect(mapAuthError(firebaseErr('auth/network-request-failed'))).toBe('network')
    expect(mapAuthError(retryableErr('Failed to fetch', 0))).toBe('network')
    expect(mapAuthError(new TypeError('Failed to fetch'))).toBe('network')
    expect(mapAuthError({ status: 0 })).toBe('network')
  })

  it('maps 429, auth/too-many-requests and over_*_rate_limit to rate_limited', () => {
    expect(mapAuthError(firebaseErr('auth/too-many-requests'))).toBe('rate_limited')
    expect(mapAuthError(authErr('Too many requests', 429, 'over_request_rate_limit'))).toBe('rate_limited')
    expect(mapAuthError({ status: 400, code: 'over_email_send_rate_limit' })).toBe('rate_limited')
  })

  it('maps anything else to unknown', () => {
    expect(mapAuthError(firebaseErr('auth/operation-not-allowed'))).toBe('unknown')
    expect(mapAuthError(authErr('Email logins are disabled', 422, 'email_provider_disabled'))).toBe('unknown')
    expect(mapAuthError(authErr('boom', 500, 'unexpected_failure'))).toBe('unknown')
    expect(mapAuthError(null)).toBe('unknown')
    expect(mapAuthError('nope')).toBe('unknown')
  })
})

describe('mapResetRequestError', () => {
  it('distinguishes network, rate-limit and unknown', () => {
    expect(mapResetRequestError(firebaseErr('auth/network-request-failed'))).toBe('network')
    expect(mapResetRequestError(firebaseErr('auth/too-many-requests'))).toBe('rate_limited')
    expect(mapResetRequestError(retryableErr('Failed to fetch', 0))).toBe('network')
    expect(mapResetRequestError(authErr('wait', 429, 'over_email_send_rate_limit'))).toBe('rate_limited')
    expect(mapResetRequestError(authErr('boom', 500, 'unexpected_failure'))).toBe('unknown')
  })
})

describe('mapUpdatePasswordError', () => {
  it('maps weak/same password and 422 to weak_password', () => {
    expect(mapUpdatePasswordError(firebaseErr('auth/weak-password'))).toBe('weak_password')
    expect(mapUpdatePasswordError(authErr('weak', 422, 'weak_password'))).toBe('weak_password')
    expect(mapUpdatePasswordError(authErr('same', 422, 'same_password'))).toBe('weak_password')
    expect(mapUpdatePasswordError(new TypeError('Failed to fetch'))).toBe('network')
    expect(mapUpdatePasswordError(authErr('boom', 500, 'unexpected_failure'))).toBe('unknown')
  })
})

describe('mapVerifyRecoveryError', () => {
  it('shows expired for expired, used or invalid links, network for no connection', () => {
    expect(mapVerifyRecoveryError(firebaseErr('auth/expired-action-code'))).toBe('expired')
    expect(mapVerifyRecoveryError(firebaseErr('auth/invalid-action-code'))).toBe('expired')
    expect(mapVerifyRecoveryError(authErr('Token has expired or is invalid', 403, 'otp_expired'))).toBe('expired')
    expect(mapVerifyRecoveryError(authErr('bad', 400, 'validation_failed'))).toBe('expired')
    expect(mapVerifyRecoveryError(retryableErr('Failed to fetch', 0))).toBe('network')
  })
})
