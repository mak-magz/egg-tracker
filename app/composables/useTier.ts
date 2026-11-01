// Operational tier management (Feature 08, Offline-first).
// Free tier is the default: zero authentication required, 100% local OPFS SQLite execution, zero network API calls.
// Premium tier is activated when the user explicitly upgrades or logs in to enable cloud sync.

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
   * Retrieves the Firebase ID token IF AND ONLY IF the user is on the Premium tier
   * and has an active Firebase Auth session. For Free users, returns null immediately
   * with zero network or SDK overhead.
   */
  async function getAuthToken(): Promise<string | null> {
    if (isFree.value) return null
    if (!import.meta.client) return null

    try {
      const auth = useFirebaseAuth()
      if (!auth?.currentUser) return null
      return await auth.currentUser.getIdToken()
    }
    catch {
      return null
    }
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
