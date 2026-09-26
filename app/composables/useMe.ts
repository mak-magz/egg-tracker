// The signed-in user's email + farm, from GET /api/me (§3.4, §3.8). Fetched once per app load
// (SSR forwards cookies via useRequestFetch) and kept in useState, so it's in the SSR payload and
// the shell never renders without it.
import type { FarmSize, MeResponse } from '#shared/types/api'

export type MeStatus = 'idle' | 'loading' | 'ready' | 'error'
/** What `ensure()` found. `unauthenticated` = /api/me said 401 (session missing, invalid or revoked). */
export type MeEnsureResult = 'ready' | 'unauthenticated' | 'error'

// Deduplicates concurrent ensure() calls per app instance (per request on the server).
const inflight = new WeakMap<object, Promise<MeEnsureResult>>()

function statusCodeOf(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const err = e as { statusCode?: unknown, status?: unknown }
  const code = err.statusCode ?? err.status
  return typeof code === 'number' ? code : undefined
}

export function useMe() {
  const nuxtApp = useNuxtApp()
  const requestFetch = useRequestFetch()
  const me = useState<MeResponse | null>('me', () => null)
  const status = useState<MeStatus>('me:status', () => 'idle')

  async function load(): Promise<MeEnsureResult> {
    status.value = 'loading'
    try {
      me.value = await requestFetch<MeResponse>('/api/me', { retry: 0 })
      status.value = 'ready'
      return 'ready'
    }
    catch (e) {
      me.value = null
      if (statusCodeOf(e) === 401) {
        status.value = 'idle'
        return 'unauthenticated'
      }
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
