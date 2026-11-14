// Operational tier management (Feature 08, Offline-first).
// Free tier is the default: zero authentication required, 100% local OPFS SQLite execution, zero network API calls.
// Premium tier is activated when the user explicitly upgrades or logs in to enable cloud sync.
import { getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'

export type UserTier = 'free' | 'premium'

export const TIER_COOKIE_NAME = 'tamago_tier'

export function useTier() {
  const tierCookie = useCookie<UserTier>(TIER_COOKIE_NAME, {
    default: () => 'free',
    maxAge: 60 * 60 * 24 * 400,
    sameSite: 'lax',
    path: '/',
    secure: !import.meta.dev,
  })

  const isFree = computed(() => tierCookie.value !== 'premium')
  const isPremium = computed(() => tierCookie.value === 'premium')

  /**
   * Retrieves the Firebase ID token IF AND ONLY IF the user has an active Firebase Auth session.
   * Obtains the Auth instance directly from Firebase App SDK to avoid Vue inject() warnings
   * when invoked from background timers / SyncEngine outside setup() context.
   */
  async function getAuthToken(): Promise<string | null> {
    if (!import.meta.client || isFree.value) return null

    let auth = null
    try {
      const apps = getApps()
      if (apps.length > 0) auth = getAuth(apps[0])
    }
    catch {
      // Firebase app not yet initialized
    }
    if (!auth) {
      try {
        auth = useFirebaseAuth()
      }
      catch {
        // Vue setup context unavailable
      }
    }

    if (auth && !auth.currentUser && typeof (auth as { authStateReady?: () => Promise<void> }).authStateReady === 'function') {
      try {
        await (auth as { authStateReady: () => Promise<void> }).authStateReady()
      }
      catch {
        // Proceed with null token if auth initialization fails
      }
    }

    if (auth?.currentUser) {
      return await auth.currentUser.getIdToken()
    }
    return null
  }

  function upgradeToPremium() {
    tierCookie.value = 'premium'
  }

  function revertToFree() {
    tierCookie.value = 'free'
  }

  return {
    tier: readonly(tierCookie),
    isFree,
    isPremium,
    getAuthToken,
    upgradeToPremium,
    revertToFree,
  }
}
