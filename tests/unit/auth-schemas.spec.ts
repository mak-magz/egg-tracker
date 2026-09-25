import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN_LENGTH } from '../../shared/constants/auth'
import { AUTH_MESSAGES, forgotPasswordSchema, newPasswordSchema, signInSchema } from '../../shared/schemas/auth'

function messages(result: { success: boolean, error?: { issues: { path: PropertyKey[], message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map(i => [i.path.join('.'), i.message]))
}

describe('auth schemas', () => {
  it('uses a minimum password length of 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
  })

  it('signIn: accepts a valid email and any non-empty password, trimming the email', () => {
    const r = signInSchema.safeParse({ email: '  owner@farm.com ', password: 'x' })
    expect(r.success).toBe(true)
    expect(r.data?.email).toBe('owner@farm.com')
  })

  it('signIn: empty fields get the "enter" messages (AC4)', () => {
    const r = signInSchema.safeParse({ email: '', password: '' })
    expect(messages(r)).toEqual({ email: AUTH_MESSAGES.emailRequired, password: AUTH_MESSAGES.passwordRequired })
  })

  it('signIn: a malformed email gets the format message (AC4)', () => {
    const r = signInSchema.safeParse({ email: 'owner@', password: 'secret' })
    expect(messages(r)).toEqual({ email: AUTH_MESSAGES.emailInvalid })
  })

  it('forgotPassword validates the email the same way', () => {
    expect(messages(forgotPasswordSchema.safeParse({ email: ' ' }))).toEqual({ email: AUTH_MESSAGES.emailRequired })
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true)
  })

  it('newPassword: enforces the minimum length', () => {
    const r = newPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' })
    expect(messages(r)).toEqual({ password: AUTH_MESSAGES.passwordTooShort })
    expect(AUTH_MESSAGES.passwordTooShort).toBe('Use at least 8 characters')
  })

  it('newPassword: flags a mismatch on the confirm field', () => {
    const r = newPasswordSchema.safeParse({ password: 'longenough', confirmPassword: 'different1' })
    expect(messages(r)).toEqual({ confirmPassword: AUTH_MESSAGES.passwordsDontMatch })
  })

  it('newPassword: accepts matching passwords of the minimum length', () => {
    expect(newPasswordSchema.safeParse({ password: '12345678', confirmPassword: '12345678' }).success).toBe(true)
  })
})
