import { getRequestHeader, readBody, setCookie } from 'h3'
import { defineAdminLoginHandler } from '../../utils/handlers'
import { getFirebaseAdminAuth } from '../../utils/auth'
import { apiError } from '../../utils/errors'
import { recordAdminAuditLog } from '../../repositories/admin-audit'

export default defineAdminLoginHandler(async (event) => {
  const rawBody = (event as { _body?: Record<string, unknown> })._body ?? (await readBody(event).catch(() => ({})) || {})
  const body = (typeof rawBody === 'object' && rawBody !== null ? rawBody : {}) as Record<string, unknown>
  const authHeader = getRequestHeader(event, 'authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  const idToken = typeof body.idToken === 'string' ? body.idToken : bearerToken
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : undefined

  // Check ADMIN_EMAILS
  const adminEmailsRaw = process.env.ADMIN_EMAILS?.trim() || ''
  const adminEmails = adminEmailsRaw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  const adminAuth = getFirebaseAdminAuth(event)
  let verifiedEmail: string
  let verifiedUid: string
  let tokenForCookie: string | null | undefined = idToken

  if (idToken) {
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true)
      verifiedEmail = (decoded.email || '').toLowerCase()
      verifiedUid = decoded.uid
    }
    catch {
      throw apiError(401, 'unauthenticated')
    }
  }
  else if (email && password) {
    // If raw credentials provided, first check if email is in ADMIN_EMAILS to avoid leaking auth existence
    if (!adminEmails.includes(email)) {
      throw apiError(403, 'forbidden')
    }

    // Authenticate via Firebase REST
    const apiKey = process.env.NUXT_PUBLIC_FIREBASE_API_KEY || 'fake-api-key'
    const endpoint = process.env.FIREBASE_AUTH_EMULATOR_HOST
      ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`
      : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      })

      if (!res.ok) {
        throw apiError(401, 'unauthenticated')
      }

      const data = await res.json() as { idToken?: string, localId?: string, email?: string }
      tokenForCookie = data.idToken
      verifiedEmail = (data.email || email).toLowerCase()
      verifiedUid = data.localId || ''
    }
    catch (e) {
      if ((e as { statusCode?: number }).statusCode) throw e
      throw apiError(401, 'unauthenticated')
    }
  }
  else {
    throw apiError(400, 'validation_failed')
  }

  // Verify email is in ADMIN_EMAILS
  if (!verifiedEmail || !adminEmails.includes(verifiedEmail)) {
    throw apiError(403, 'forbidden')
  }

  // Mint and set 5-day session cookie
  if (tokenForCookie) {
    try {
      const expiresIn = 5 * 24 * 60 * 60 * 1000 // 5 days
      const sessionCookie = await adminAuth.createSessionCookie(tokenForCookie, { expiresIn })
      setCookie(event, '__session', sessionCookie, {
        maxAge: 5 * 24 * 60 * 60,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
      })
    }
    catch {
      // Session cookie creation failure shouldn't abort if bearer token is valid
    }
  }

  // Record audit log
  await recordAdminAuditLog({
    operatorEmail: verifiedEmail,
    actionType: 'operator_login',
    targetId: verifiedUid || 'operator',
    summary: 'Operator signed in via admin portal',
  })

  return {
    ok: true,
    email: verifiedEmail,
    role: 'operator',
  }
})
