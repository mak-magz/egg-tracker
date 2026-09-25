// Auth form schemas (zod 4). Usable directly as `UForm :schema` through Standard Schema.
// Messages are the §2.5 copy. Relative import so the provisioning CLI (run by Bun, outside Nuxt) can use it.
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '../constants/auth'

export const AUTH_MESSAGES = {
  emailRequired: 'Enter your email',
  emailInvalid: 'Enter a valid email, like you@yourfarm.com',
  passwordRequired: 'Enter your password',
  passwordTooShort: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
  passwordsDontMatch: 'Passwords don\'t match',
} as const

/** Trimmed, required, email-format. Empty and malformed get different messages (AC4). */
export const emailSchema = z
  .string({ error: AUTH_MESSAGES.emailRequired })
  .trim()
  .min(1, { error: AUTH_MESSAGES.emailRequired })
  .pipe(z.email({ error: AUTH_MESSAGES.emailInvalid }))

/** Sign-in only checks presence: the length rule applies when a password is set, not when it's typed. */
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string({ error: AUTH_MESSAGES.passwordRequired }).min(1, { error: AUTH_MESSAGES.passwordRequired }),
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const newPasswordValueSchema = z
  .string({ error: AUTH_MESSAGES.passwordTooShort })
  .min(PASSWORD_MIN_LENGTH, { error: AUTH_MESSAGES.passwordTooShort })

export const newPasswordSchema = z
  .object({
    password: newPasswordValueSchema,
    confirmPassword: z.string({ error: AUTH_MESSAGES.passwordsDontMatch }),
  })
  .refine(v => v.password === v.confirmPassword, {
    error: AUTH_MESSAGES.passwordsDontMatch,
    path: ['confirmPassword'],
  })

export type SignInInput = z.infer<typeof signInSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type NewPasswordInput = z.infer<typeof newPasswordSchema>
