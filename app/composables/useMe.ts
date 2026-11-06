// The signed-in user's email + farm, from GET /api/me (§3.4, §3.8). Fetched once per app load
// (SSR forwards cookies via useRequestFetch) and kept in useState, so it's in the SSR payload and
// the shell never renders without it.
// In Feature 08 (Offline-first), unauthenticated visitors load their local farm from local SQLite WASM.
import type { FarmSize, MeResponse } from '#shared/types/api'
import { localRouter } from '../local/router'
import { useTier } from './useTier'

export type MeStatus = 'idle' | 'loading' | 'ready' | 'error'
/** What `ensure()` found. `unauthenticated` = /api/me said 401 (session missing, invalid or revoked). */
export type MeEnsureResult = 'ready' | 'unauthenticated' | 'error'

// Deduplicates concurrent ensure() calls per app instance (per request on the server).
const inflight = new WeakMap<object, Promise<MeEnsureResult>>()

export function useMe() {
  const nuxtApp = useNuxtApp()
  const requestFetch = useRequestFetch()
  const me = useState<MeResponse | null>('me', () => null)
  const status = useState<MeStatus>('me:status', () => 'idle')

  async function load(): Promise<MeEnsureResult> {
    status.value = 'loading'
    try {
      if (import.meta.server) {
        me.value = null
        status.value = 'idle'
        return 'unauthenticated'
      }

      // Defense-in-depth: Never query local SQLite worker on admin routes
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname
        if (currentPath.startsWith('/admin') || currentPath.startsWith('/login/admin')) {
          me.value = null
          status.value = 'idle'
          return 'unauthenticated'
        }
      }

      const { isFree, getAuthToken } = useTier()

      // Free / Offline mode (Feature 08 AC1):
      // Free users operate 100% locally via SQLite WASM in OPFS with ZERO network HTTP traffic.
      if (isFree.value) {
        const localMe = await localRouter.dispatch<MeResponse>('/api/me')
        me.value = { ...localMe, isFree: true, tier: 'free' }
        status.value = 'ready'
        return 'ready'
      }

      // Premium mode: check for valid auth token before making any network call
      const token = await getAuthToken()
      if (!token) {
        // Premium tier but unauthenticated / token expired: fall back to local SQLite without failing
        const localMe = await localRouter.dispatch<MeResponse>('/api/me')
        me.value = { ...localMe, isFree: false, tier: 'premium' }
        status.value = 'ready'
        return 'ready'
      }

      // Authenticated Premium cloud user: try network fetch with Bearer token
      try {
        const cloudMe = await requestFetch<MeResponse>('/api/me', {
          headers: { Authorization: `Bearer ${token}` },
          retry: 0,
        })
        me.value = { ...cloudMe, isFree: false, tier: 'premium' }
        status.value = 'ready'
        return 'ready'
      }
      catch {
        // Fall back to local SQLite WASM if offline / network error
        const localMe = await localRouter.dispatch<MeResponse>('/api/me')
        me.value = { ...localMe, isFree: false, tier: 'premium' }
        status.value = 'ready'
        return 'ready'
      }
    }
    catch {
      me.value = null
      status.value = 'error'
      return 'error'
    }
  }

  function ensure(opts: { force?: boolean } = {}): Promise<MeEnsureResult> {
    if (!opts.force && status.value === 'ready') return Promise.resolve('ready')
    const pending = inflight.get(nuxtApp)
    if (pending) return pending
    const p = load().finally(() => inflight.delete(nuxtApp))
    inflight.set(nuxtApp, p)
    return p
  }

  function clear() {
    me.value = null
    status.value = 'idle'
    try {
      const { revertToFree } = useTier()
      revertToFree()
    }
    catch {
      // Ignore errors when resetting tier
    }
    // Clients are personal data (feature 03 AC31): the list and any other `clients:*` state go with the session,
    // so the next farm on this device never sees them, even for a moment.
    clearNuxtState(key => key.startsWith('clients:'))
    // Sales point at clients (feature 04 AC61): the list, and the on-hand cache, go with the session too.
    clearNuxtState(key => key.startsWith('sales:') || key.startsWith('on-hand:'))
    // Orders point at clients too (feature 05 AC55): the list and any open stacked detail go with the session.
    clearNuxtState(key => key.startsWith('orders:') || key.startsWith('detail-stack:'))
  }

  /**
   * Replaces the farm's size list (feature 02: a change made on Settings, or a quiet refresh). Every reader
   * (Production form, day cards, chart) follows because they all read `me.farm.sizes`. Does nothing without a
   * farm and never touches `status`, so it can't send the shell to "Couldn't load your farm".
   */
  function setSizes(sizes: FarmSize[]) {
    me.value = replaceFarmSizes(me.value, sizes)
  }

  return {
    me: readonly(me),
    status: readonly(status),
    ensure,
    clear,
    setSizes,
  }
}
