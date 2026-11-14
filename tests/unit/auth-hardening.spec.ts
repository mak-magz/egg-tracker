import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { verifyBearerTokenWithFallback } from '../../server/utils/auth'
import { mapWithConcurrency } from '../../server/utils/concurrency'

type VerifyAdminAuth = Parameters<typeof verifyBearerTokenWithFallback>[0]

describe('Auth Hardening & Concurrency Helper', () => {
  const originalEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST
  const originalNodeEnv = process.env.NODE_ENV
  const originalServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT

  afterEach(() => {
    if (originalEmulator === undefined) {
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST
    }
    else {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = originalEmulator
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    }
    else {
      process.env.NODE_ENV = originalNodeEnv
    }
    if (originalServiceAccount === undefined) {
      delete process.env.FIREBASE_SERVICE_ACCOUNT
    }
    else {
      process.env.FIREBASE_SERVICE_ACCOUNT = originalServiceAccount
    }
  })

  it('allows app/invalid-credential fallback only in non-production without service account credentials', async () => {
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST
    delete process.env.FIREBASE_SERVICE_ACCOUNT
    process.env.NODE_ENV = 'test'
    const decoded = { uid: 'u1', email: 'owner@example.com' } as unknown as DecodedIdToken
    const authAdmin = {
      verifyIdToken: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error('invalid cert'), { code: 'app/invalid-credential' }))
        .mockResolvedValueOnce(decoded),
    }

    const res = await verifyBearerTokenWithFallback(authAdmin as unknown as VerifyAdminAuth, 'tok-1')
    expect(res).toEqual(decoded)
    expect(authAdmin.verifyIdToken).toHaveBeenNthCalledWith(1, 'tok-1', true)
    expect(authAdmin.verifyIdToken).toHaveBeenNthCalledWith(2, 'tok-1', false)
  })

  it('fails closed on app/invalid-credential in production or when service account credentials exist', async () => {
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"type":"service_account"}'
    process.env.NODE_ENV = 'production'
    const authAdmin = {
      verifyIdToken: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error('invalid cert'), { code: 'app/invalid-credential' })),
    }

    await expect(verifyBearerTokenWithFallback(authAdmin as unknown as VerifyAdminAuth, 'tok-prod')).rejects.toThrow('invalid cert')
    expect(authAdmin.verifyIdToken).toHaveBeenCalledTimes(1)
  })

  it('rethrows non-allowlisted errors such as auth/id-token-revoked without fallback', async () => {
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST
    const revokedErr = Object.assign(new Error('Token revoked'), { code: 'auth/id-token-revoked' })
    const authAdmin = {
      verifyIdToken: vi.fn().mockRejectedValueOnce(revokedErr),
    }

    await expect(verifyBearerTokenWithFallback(authAdmin as unknown as VerifyAdminAuth, 'tok-revoked')).rejects.toThrow('Token revoked')
    expect(authAdmin.verifyIdToken).toHaveBeenCalledTimes(1)
  })

  it('uses checkRevoked=false directly when Firebase Auth Emulator is configured', async () => {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
    const decoded = { uid: 'emu-1' } as unknown as DecodedIdToken
    const authAdmin = {
      verifyIdToken: vi.fn().mockResolvedValueOnce(decoded),
    }

    const res = await verifyBearerTokenWithFallback(authAdmin as unknown as VerifyAdminAuth, 'tok-emu')
    expect(res).toEqual(decoded)
    expect(authAdmin.verifyIdToken).toHaveBeenCalledWith('tok-emu', false)
  })

  it('mapWithConcurrency caps concurrent executions and preserves result ordering', async () => {
    let active = 0
    let maxActive = 0

    const inputs = [1, 2, 3, 4, 5, 6, 7, 8]
    const outputs = await mapWithConcurrency(inputs, 3, async (n) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 10))
      active--
      return n * 10
    })

    expect(maxActive).toBeLessThanOrEqual(3)
    expect(outputs).toEqual([10, 20, 30, 40, 50, 60, 70, 80])
  })
})
