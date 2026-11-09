// Every Firebase Auth / VueFire call the UI makes (§3.5, §3.8). Browser → Firebase Auth;
// nuxt-vuefire's `/api/__session` keeps the session in an HttpOnly cookie so SSR sees it.
// Errors come back as UI "kinds", never raw.
import { localWorker } from '../local/client'
import { useTier } from './useTier'
import {
  confirmPasswordReset,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword as firebaseUpdatePassword,
  verifyPasswordResetCode,
} from 'firebase/auth'
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
 * Removes the session cookie locally or via `/api/__session`. Used when signOut() couldn't reach
 * the server: sign-out must always finish (AC14).
 */
async function clearSessionCookie() {
  if (!import.meta.client) return
  try {
    await $fetch('/api/__session', { method: 'POST', body: { token: null } })
  }
  catch {
    document.cookie = '__session=; Max-Age=0; path=/; SameSite=Lax'
  }
}

export function useAuthActions() {
  const auth = useFirebaseAuth()
  const currentUser = useCurrentUser()
  const hint = useSessionHint()
  const { ensure, clear } = useMe()
  const router = useRouter()
  /** True while the user's own sign-out runs, so the session plugin doesn't treat it as "expired". */
  const signingOut = useState('auth:signingOut', () => false)
  const expiring = useState('auth:expiring', () => false)
  /** Holds the verified oobCode and email from `verifyRecovery` so `updatePassword` can complete reset and sign in. */
  const recoveryState = useState<{ oobCode: string, email: string } | null>('auth:recoveryState', () => null)

  async function syncSessionCookie() {
    if (!auth?.currentUser) return
    try {
      const token = await auth.currentUser.getIdToken(true)
      await $fetch('/api/__session', { method: 'POST', body: { token } })
    }
    catch {
      // If session cookie minting isn't enabled or fails, client Bearer token fallback still works.
    }
  }

  async function doSignIn(email: string, password: string): Promise<Result<SignInErrorKind>> {
    if (!auth) return { ok: false, kind: 'unknown' }
    try {
      await signInWithEmailAndPassword(auth, email, password)
    }
    catch (e) {
      return { ok: false, kind: mapAuthError(e) }
    }
    hint.value = '1'

    const { upgradeToPremium } = useTier()
    upgradeToPremium()

    const onboardedCookie = useCookie('tamago_onboarded', {
      default: () => 'true',
      maxAge: 60 * 60 * 24 * 400,
      sameSite: 'lax',
      path: '/',
    })
    onboardedCookie.value = 'true'

    await syncSessionCookie()
    // A failure here isn't a sign-in failure: the middleware/layout show the farm-load state.
    await ensure({ force: true })

    try {
      const token = await auth.currentUser?.getIdToken()
      if (token) {
        const res = await $fetch<{ snapshot: any, latestVersion?: number }>('/api/sync/snapshot', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        if (res?.snapshot) {
          await localWorker.importSnapshot(res.snapshot)
          await localWorker.updateSyncState({ status: 'synced', lastError: null })
        }
      }
    }
    catch (snapshotErr) {
      console.warn('[doSignIn] Failed to hydrate cloud snapshot locally:', snapshotErr)
    }

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

  /** Local sign-out (D15) that always completes, even offline. Does not navigate. */
  async function endSessionLocally() {
    if (auth) {
      try {
        await firebaseSignOut(auth)
      }
      catch {
        // Proceed with clearing cookies and state even if Firebase signOut fails.
      }
    }
    await clearSessionCookie()
    recoveryState.value = null
    const { revertToFree } = useTier()
    revertToFree()
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
    if (!auth) return { ok: false, kind: 'unknown' }
    try {
      await sendPasswordResetEmail(auth, email)
      return { ok: true }
    }
    catch (e) {
      return { ok: false, kind: mapResetRequestError(e) }
    }
  }

  /** Run client-side only (onMounted), so link scanners can't use up the one-time action code (§3.5). */
  async function verifyRecovery(oobCode: string): Promise<VerifyRecoveryResult> {
    if (!auth) return 'expired'
    try {
      const email = await verifyPasswordResetCode(auth, oobCode)
      recoveryState.value = { oobCode, email }
      return 'valid'
    }
    catch (e) {
      recoveryState.value = null
      return mapVerifyRecoveryError(e)
    }
  }

  async function updatePassword(password: string): Promise<Result<UpdatePasswordErrorKind>> {
    if (!auth) return { ok: false, kind: 'unknown' }
    try {
      if (recoveryState.value) {
        const { oobCode, email } = recoveryState.value
        await confirmPasswordReset(auth, oobCode, password)
        recoveryState.value = null
        await signInWithEmailAndPassword(auth, email, password)
      }
      else if (currentUser.value) {
        await firebaseUpdatePassword(currentUser.value, password)
      }
      else {
        return { ok: false, kind: 'unknown' }
      }
    }
    catch (e) {
      return { ok: false, kind: mapUpdatePasswordError(e) }
    }
    hint.value = '1'
    await syncSessionCookie()
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
