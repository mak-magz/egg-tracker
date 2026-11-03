/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import handler from '../../server/api/admin/login.post'
import * as authUtils from '../../server/utils/auth'
import * as adminAudit from '../../server/repositories/admin-audit'

describe('Admin Login Endpoint (POST /api/admin/login)', () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS
  let mockEvent: any

  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'admin@tamago.farm,ops@example.com'
    mockEvent = {
      node: {
        req: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'host': 'localhost:3000',
          },
        },
        res: {
          setHeader: vi.fn(),
          getHeader: vi.fn(),
        },
      },
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        'host': 'localhost:3000',
      }),
      context: {},
      _body: undefined,
    }
    vi.spyOn(adminAudit, 'recordAdminAuditLog').mockResolvedValue({} as any)
  })

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails
    vi.restoreAllMocks()
  })

  it('rejects empty request body and missing authorization with 400 validation_failed', async () => {
    mockEvent._body = {}
    await expect(handler(mockEvent as unknown as H3Event)).rejects.toMatchObject({
      statusCode: 400,
      data: { code: 'validation_failed' },
    })
  })

  it('rejects valid Firebase user whose email is not in ADMIN_EMAILS with 403 forbidden', async () => {
    mockEvent._body = { idToken: 'token-for-non-admin' }
    vi.spyOn(authUtils, 'getFirebaseAdminAuth').mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: 'farmer-1', email: 'farmer@pastures.com' }),
    } as any)

    await expect(handler(mockEvent as unknown as H3Event)).rejects.toMatchObject({
      statusCode: 403,
      data: { code: 'forbidden' },
    })
  })

  it('rejects invalid or expired idToken with 401 unauthenticated', async () => {
    mockEvent._body = { idToken: 'bad-token' }
    vi.spyOn(authUtils, 'getFirebaseAdminAuth').mockReturnValue({
      verifyIdToken: vi.fn().mockRejectedValue(new Error('Firebase ID token has expired')),
    } as any)

    await expect(handler(mockEvent as unknown as H3Event)).rejects.toMatchObject({
      statusCode: 401,
      data: { code: 'unauthenticated' },
    })
  })

  it('authenticates valid operator via idToken, mints session cookie, and logs audit', async () => {
    mockEvent._body = { idToken: 'valid-admin-token' }
    const createSessionCookieMock = vi.fn().mockResolvedValue('session-cookie-xyz-123')

    vi.spyOn(authUtils, 'getFirebaseAdminAuth').mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: 'admin-uid-1', email: 'admin@tamago.farm' }),
      createSessionCookie: createSessionCookieMock,
    } as any)

    const auditSpy = vi.spyOn(adminAudit, 'recordAdminAuditLog').mockResolvedValue({} as any)

    const res = await handler(mockEvent as unknown as H3Event)

    expect(res).toEqual({
      ok: true,
      email: 'admin@tamago.farm',
      role: 'operator',
    })
    expect(createSessionCookieMock).toHaveBeenCalledWith('valid-admin-token', expect.any(Object))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      operatorEmail: 'admin@tamago.farm',
      actionType: 'operator_login',
    }))
  })

  it('rejects raw email/password for non-admin email with 403 forbidden without calling auth', async () => {
    mockEvent._body = { email: 'stranger@example.com', password: 'password123' }

    await expect(handler(mockEvent as unknown as H3Event)).rejects.toMatchObject({
      statusCode: 403,
      data: { code: 'forbidden' },
    })
  })
})
