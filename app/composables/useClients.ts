// The one owner of the farm's client list (feature 03 §3.4, AC30, AC31). Clients are personal data, so:
//   - the list lives in useState('clients:state'): MEMORY ONLY. Nothing is put in the URL, any browser
//     storage, a cookie or /api/me, and it is loaded on the client after mount, never during SSR, so the
//     server-rendered HTML and the payload never hold a client.
//   - it is keyed by the farm id. State stored for another farm is ignored (farm B can never see farm A's
//     clients, even for a moment), and useMe().clear() drops every `clients:*` key on sign-out.
// First visit: `loading`. A later visit in the same session shows the known list at once and refreshes quietly
// (`refreshing`); a failed quiet refresh keeps the list and bumps `refreshFailed` (the page toasts).
// The Sales client picker reuses this: `activeClients` is the list it offers (feature 03 AC34).
import type { Client, ClientsResponse } from '#shared/types/api'
import { compareClients } from '#shared/utils/client-list'
import { mergeRecent, upsertClient } from '~/utils/client-store'
import { CLIENT_WRITE_TIMEOUT_MS } from '~/utils/client-mutations'

export type ClientsStatus = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error'

interface ClientsState {
  farmId: string
  status: ClientsStatus
  /** A read has succeeded at least once (so `clients` is the whole list, not just what this screen saved). */
  loaded: boolean
  clients: Client[]
  /** Counts failed quiet refreshes; the page shows a toast on each. */
  failures: number
}

// Client-only module state (load() never runs during SSR). A read that is superseded by a newer one is dropped.
let loadSeq = 0
/** Clients this screen saved while a read was in flight: a read that started before an add can come back without it. */
let recent: Client[] | null = null

export function useClients() {
  const api = useApi()
  const { farm } = useFarm()
  const farmId = computed(() => farm.value?.id ?? null)
  const state = useState<ClientsState | null>('clients:state', () => null)

  // The stored state counts only for the signed-in farm. It may also be cleared to undefined on sign-out while a
  // page is still mounted, so every read tolerates that.
  const current = computed(() => (state.value && state.value.farmId === farmId.value ? state.value : null))

  const status = computed<ClientsStatus>(() => current.value?.status ?? 'idle')
  const clients = computed<readonly Client[]>(() => current.value?.clients ?? [])
  const refreshFailed = computed(() => current.value?.failures ?? 0)
  /** The list is known (loaded, maybe refreshing): show it, and never the loading or empty placeholder instead. */
  const hasList = computed(() => status.value === 'ready' || status.value === 'refreshing')
  const count = computed(() => clients.value.length)

  /** A to Z by name, ignoring case and accents (AC4). The one sorted copy every reader shares. */
  const sorted = computed(() => [...clients.value].sort(compareClients))
  /** Active clients only, sorted: what the Sales picker offers. */
  const activeClients = computed(() => sorted.value.filter(c => c.active))

  function patch(farmIdNow: string, change: Partial<Omit<ClientsState, 'farmId'>>) {
    const base: ClientsState = current.value ?? { farmId: farmIdNow, status: 'idle', loaded: false, clients: [], failures: 0 }
    state.value = { ...base, ...change }
  }

  /**
   * GET /api/clients. `silent`: a quiet refresh (no `refreshing` status). Resolves 'ok' | 'error' | 'stale' and never
   * throws. On error with a known list nothing changes but `refreshFailed`; with no list, status becomes `error`.
   */
  async function load(opts: { silent?: boolean } = {}): Promise<'ok' | 'error' | 'stale'> {
    const fid = farmId.value
    if (!fid) return 'stale'
    const seq = ++loadSeq
    const known = current.value?.loaded === true
    patch(fid, { status: known ? (opts.silent ? current.value!.status : 'refreshing') : 'loading' })
    recent = []
    try {
      const res = await api<ClientsResponse>('/api/clients', { timeout: CLIENT_WRITE_TIMEOUT_MS })
      if (seq !== loadSeq || farmId.value !== fid) return 'stale'
      if (!Array.isArray(res?.clients)) throw new TypeError('bad reply')
      patch(fid, { clients: mergeRecent(res.clients, recent ?? []), status: 'ready', loaded: true })
      return 'ok'
    }
    catch {
      if (seq !== loadSeq || farmId.value !== fid) return 'stale'
      if (current.value?.loaded) patch(fid, { status: 'ready', failures: current.value.failures + 1 })
      else patch(fid, { status: 'error' })
      return 'error'
    }
    finally {
      if (seq === loadSeq) recent = null
    }
  }

  /** Puts a client a write just returned into the list (add, edit, mark inactive / active). Older replies are ignored. */
  function upsert(client: Client) {
    const fid = farmId.value
    if (!fid) return
    patch(fid, { clients: upsertClient(current.value?.clients ?? [], client) })
    recent?.push(client)
  }

  /** Drops every `clients:*` key (sign-out does this through useMe().clear()). */
  function reset() {
    clearNuxtState(key => key.startsWith('clients:'))
  }

  return { status, clients, sorted, activeClients, count, hasList, refreshFailed, load, upsert, reset }
}
