// Maps Firebase Auth / fetch errors to the few kinds the UI has copy for (§2.5 "Copy", §3.5).
// Pure (no Nuxt imports) so tests/unit/auth-errors.spec.ts can import it directly.
// Never distinguishes "no such email" from "wrong password" (AC3): both are `invalid_credentials`.

export type SignInErrorKind = 'invalid_credentials' | 'network' | 'rate_limited' | 'unknown'
export type ResetRequestErrorKind = 'network' | 'rate_limited' | 'unknown'
export type UpdatePasswordErrorKind = 'network' | 'weak_password' | 'unknown'
export type VerifyRecoveryResult = 'valid' | 'expired' | 'network'

/** The UI copy for each kind. One place, so every screen says the same thing. */
export const AUTH_ERROR_COPY = {
  invalid_credentials: 'Incorrect email or password. Try again.',
  network: 'Couldn\'t connect. Check your connection and try again.',
  rate_limited: 'Please wait a minute before trying again.',
  unknown: 'Something went wrong. Try again.',
  weak_password: 'Couldn\'t save your new password. Try again.',
  session_expired: 'Your session has expired. Please sign in again.',
} as const

interface ErrorLike {
  name?: unknown
  status?: unknown
  code?: unknown
  message?: unknown
}

function asErrorLike(e: unknown): ErrorLike | null {
  return typeof e === 'object' && e !== null ? (e as ErrorLike) : null
}

/** No response from the server: offline, DNS, CORS, Firebase network failure, or retryable fetch error (status 0). */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true // fetch() rejects with TypeError when offline
  const err = asErrorLike(e)
  if (!err) return false
  if (err.code === 'auth/network-request-failed') return true
  if (err.name === 'AuthRetryableFetchError') {
    // Retryable auth fetch error (502/503/504 with no body); treat any as "couldn't connect".
    return true
  }
  if (err.status === 0) return true
  // ofetch/$fetch: FetchError with no response.
  if (err.name === 'FetchError' && (err as { statusCode?: unknown }).statusCode === undefined) return true
  return false
}

function isRateLimited(err: ErrorLike): boolean {
  if (err.status === 429) return true
  if (err.code === 'auth/too-many-requests') return true
  return typeof err.code === 'string' && /^over_.*rate_limit$/.test(err.code)
}

const FIREBASE_INVALID_CREDENTIALS_CODES = new Set([
  'auth/invalid-credential',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/invalid-email',
  'auth/invalid-login-credentials',
])

export function mapAuthError(e: unknown): SignInErrorKind {
  if (isNetworkError(e)) return 'network'
  const err = asErrorLike(e)
  if (!err) return 'unknown'
  if (isRateLimited(err)) return 'rate_limited'
  if (err.code === 'invalid_credentials') return 'invalid_credentials'
  if (typeof err.code === 'string' && FIREBASE_INVALID_CREDENTIALS_CODES.has(err.code)) return 'invalid_credentials'
  // Older GoTrue versions: 400 with no code for wrong email/password.
  if (err.status === 400 && err.code === undefined) return 'invalid_credentials'
  return 'unknown'
}

export function mapResetRequestError(e: unknown): ResetRequestErrorKind {
  if (isNetworkError(e)) return 'network'
  const err = asErrorLike(e)
  if (err && isRateLimited(err)) return 'rate_limited'
  return 'unknown'
}

export function mapUpdatePasswordError(e: unknown): UpdatePasswordErrorKind {
  if (isNetworkError(e)) return 'network'
  const err = asErrorLike(e)
  if (
    err
    && (
      err.code === 'weak_password'
      || err.code === 'same_password'
      || err.code === 'auth/weak-password'
      || err.status === 422
    )
  ) {
    return 'weak_password'
  }
  return 'unknown'
}

/**
 * verifyPasswordResetCode / verifyOtp failure → the reset screen state. Both expired and already-used links
 * (`auth/expired-action-code`, `auth/invalid-action-code`, `otp_expired`) or any other non-network error
 * (bad/missing token) are shown the same way (§3.5).
 */
export function mapVerifyRecoveryError(e: unknown): Exclude<VerifyRecoveryResult, 'valid'> {
  return isNetworkError(e) ? 'network' : 'expired'
}
