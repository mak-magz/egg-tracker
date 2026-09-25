// Every Supabase Auth call the UI makes (§3.5, §3.8). Browser → Supabase Auth with the publishable key;
// @supabase/ssr keeps the session in cookies so SSR sees it. Errors come back as UI "kinds", never raw.
import {
  mapAuthError,
  mapResetRequestError,
  mapUpdatePasswordError,
  mapVerifyRecoveryError,
} from '~/utils/auth-errors'
import type {
  ResetRequestErrorKind,
  SignInErrorKind,
  UpdatePasswordErrorKind,
  VerifyRecoveryResult,
} from '~/utils/auth-errors'

type Result<K> = { ok: true } | { ok: false, kind: K }

// One sign-in at a time per tab, whatever the UI does (AC5). Client-only by nature.
let signInInFlight: Promise<Result<SignInErrorKind>> | null = null

/**
 * Removes the Supabase auth cookies directly. Used when signOut() couldn't reach the server:
 * supabase-js keeps the local session on a network error, but sign-out must always finish (AC14).
 */
function clearAuthCookiesLocally(prefix: string) {
  if (!import.meta.client) return
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name && name.startsWith(prefix)) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
    }
  }
}

export function useAuthActions() {
  const supabase = useSupabaseClient()
  const supabaseUser = useSupabaseUser()
  const supabaseSession = useSupabaseSession()
  const hint = useSessionHint()
  const { ensure, clear } = useMe()
  const router = useRouter()
  const cookiePrefix = useRuntimeConfig().public.supabase.cookiePrefix as string | undefined
  /** True while the user's own sign-out runs, so the session plugin doesn't treat it as "expired". */
  const signingOut = useState('auth:signingOut', () => false)
  const expiring = useState('auth:expiring', () => false)

  /** The module updates useSupabaseUser asynchronously; the middleware needs it now. */
  async function syncUserState() {
    const [{ data: sessionData }, { data: claimsData }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getClaims(),
    ])
    supabaseSession.value = sessionData.session
    supabaseUser.value = claimsData?.claims ?? null
  }

  async function doSignIn(email: string, password: string): Promise<Result<SignInErrorKind>> {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { ok: false, kind: mapAuthError(error) }
    }
    catch (e) {
      return { ok: false, kind: mapAuthError(e) }
    }
    hint.value = '1'
    await syncUserState()
    // A failure here isn't a sign-in failure: the middleware/layout show the farm-load state.
    await ensure({ force: true })
    return { ok: true }
  }

  function signIn(email: string, password: string): Promise<Result<SignInErrorKind>> {
    if (!signInInFlight) {
      signInInFlight = doSignIn(email, password).finally(() => {
        signInInFlight = null
      })
    }
    return signInInFlight
  }

  /** Local-only sign-out (D15) that always completes, even offline. Does not navigate. */
  async function endSessionLocally() {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error && cookiePrefix) clearAuthCookiesLocally(cookiePrefix)
    }
    catch {
      if (cookiePrefix) clearAuthCookiesLocally(cookiePrefix)
    }
    supabaseSession.value = null
    supabaseUser.value = null
    clear()
  }

  /** One tap, no confirmation (AC14). A full reload drops in-memory farm data, so Back can't show it. */
  async function signOut() {
    signingOut.value = true
    await endSessionLocally()
    hint.value = null
    // `force`: reloadNuxtApp otherwise skips a reload to the same path within 10 s (loop guard),
    // which silently broke a second sign-out shortly after a first one.
    reloadNuxtApp({ path: '/login', persistState: false, force: true })
  }

  /** The session ended without the user signing out (AC11): back to sign-in, then back here. */
  async function handleSessionExpired() {
    if (expiring.value || signingOut.value) return
    expiring.value = true
    try {
      const from = router.currentRoute.value.fullPath
      await endSessionLocally()
      await navigateTo(loginLocation(from, true), { replace: true })
    }
    finally {
      expiring.value = false
    }
  }

  async function requestPasswordReset(email: string): Promise<Result<ResetRequestErrorKind>> {
    try {
      // The link target comes from the recovery email template (token_hash flow, D9).
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) return { ok: false, kind: mapResetRequestError(error) }
      return { ok: true }
    }
    catch (e) {
      return { ok: false, kind: mapResetRequestError(e) }
    }
  }

  /** Run client-side only (onMounted), so link scanners can't use up the one-time token (§3.5). */
  async function verifyRecovery(tokenHash: string): Promise<VerifyRecoveryResult> {
    try {
      const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
      if (error) return mapVerifyRecoveryError(error)
    }
    catch (e) {
      return mapVerifyRecoveryError(e)
    }
    await syncUserState()
    return 'valid'
  }

  async function updatePassword(password: string): Promise<Result<UpdatePasswordErrorKind>> {
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) return { ok: false, kind: mapUpdatePasswordError(error) }
    }
    catch (e) {
      return { ok: false, kind: mapUpdatePasswordError(e) }
    }
    hint.value = '1'
    await syncUserState()
    await ensure({ force: true })
    return { ok: true }
  }

  return {
    signIn,
    signOut,
    handleSessionExpired,
    requestPasswordReset,
    verifyRecovery,
    updatePassword,
  }
}
