// The one owner of the farm's (current window of) sales (feature 04 §3.4). Unlike useClients (the whole
// list, filtered client-side), the Sales list is filtered and PAGED on the server (AC52's 5,000-sale bar,
// and no per-keystroke text search here): this holds the current filters and the page(s) fetched for them,
// and refetches whenever a filter changes. `hasAny` tells first use (AC46) from no match (AC10).
//
// State lives in useState('sales:state'), keyed by farm id (feature 03's own privacy pattern: state for
// another farm is ignored, and useMe().clear() drops every `sales:*` key on sign-out, AC61). A sale never
// carries a client's NAME (only `clientId`, AC60) — this composable and its readers join names client-side
// from useClients().
import type { IsoDate, Sale, SalesListResponse, SaleType } from '#shared/types/api'
import { SALES_PAGE_SIZE } from '#shared/constants/sales'

export type SalesStatusFilter = 'all' | 'pending' | 'complete'
export type SalesTypeFilter = 'all' | SaleType

export interface SalesFilters {
  from: IsoDate | null
  to: IsoDate | null
  status: SalesStatusFilter
  type: SalesTypeFilter
  clientId: string | null
  /** "Show voided sales" (AC68). Off by default; not one of the "n filters" the mobile Filters button counts. */
  includeVoided: boolean
}

export function defaultSalesFilters(): SalesFilters {
  return { from: null, to: null, status: 'all', type: 'all', clientId: null, includeVoided: false }
}

export type SalesLoadStatus = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error'

interface SalesState {
  farmId: string
  status: SalesLoadStatus
  filters: SalesFilters
  hasAny: boolean
  total: number
  sales: Sale[]
  loadingMore: boolean
  /** Counts failed quiet refreshes; the page toasts on each (mirrors useClients). */
  failures: number
}

let loadSeq = 0

/** True when `sale` would be included under `filters` (used for optimistic insert/remove after a write). */
export function saleMatchesFilters(sale: Sale, filters: SalesFilters): boolean {
  if (!filters.includeVoided && sale.voidedAt) return false
  if (filters.status !== 'all' && sale.status !== filters.status) return false
  if (filters.type !== 'all' && sale.type !== filters.type) return false
  if (filters.clientId && sale.clientId !== filters.clientId) return false
  if (filters.from && sale.saleDate < filters.from) return false
  if (filters.to && sale.saleDate > filters.to) return false
  return true
}

/** Newest sale date first; same date -> highest sale number first (AC4). */
export function compareSalesNewestFirst(a: Sale, b: Sale): number {
  if (a.saleDate !== b.saleDate) return a.saleDate < b.saleDate ? 1 : -1
  return b.saleNumber - a.saleNumber
}

function query(filters: SalesFilters, limit: number, offset: number): Record<string, string | number | boolean> {
  const q: Record<string, string | number | boolean> = { limit, offset }
  if (filters.from) q.from = filters.from
  if (filters.to) q.to = filters.to
  if (filters.status !== 'all') q.status = filters.status
  if (filters.type !== 'all') q.type = filters.type
  if (filters.clientId) q.clientId = filters.clientId
  if (filters.includeVoided) q.includeVoided = true
  return q
}

export function useSales() {
  const api = useApi()
  const { farm } = useFarm()
  const farmId = computed(() => farm.value?.id ?? null)
  const state = useState<SalesState | null>('sales:state', () => null)

  const current = computed(() => (state.value && state.value.farmId === farmId.value ? state.value : null))

  const status = computed<SalesLoadStatus>(() => current.value?.status ?? 'idle')
  const filters = computed(() => current.value?.filters ?? defaultSalesFilters())
  const sales = computed<readonly Sale[]>(() => current.value?.sales ?? [])
  const total = computed(() => current.value?.total ?? 0)
  const hasAny = computed(() => current.value?.hasAny ?? false)
  const loadingMore = computed(() => current.value?.loadingMore ?? false)
  const refreshFailed = computed(() => current.value?.failures ?? 0)
  /** The list is known (loaded, maybe refreshing): show it, never the loading placeholder. */
  const hasList = computed(() => status.value === 'ready' || status.value === 'refreshing')
  /** "Show more" (AC7); never true for the Pending filter, which the server never limits (AC9). */
  const hasMore = computed(() => sales.value.length < total.value)

  function patch(farmIdNow: string, change: Partial<Omit<SalesState, 'farmId'>>) {
    const base: SalesState = current.value ?? {
      farmId: farmIdNow,
      status: 'idle',
      filters: defaultSalesFilters(),
      hasAny: false,
      total: 0,
      sales: [],
      loadingMore: false,
      failures: 0,
    }
    state.value = { ...base, ...change }
  }

  /** GET /api/sales with `filters`, replacing the current page. Resolves 'ok' | 'error' | 'stale'. */
  async function load(next: SalesFilters, opts: { silent?: boolean } = {}): Promise<'ok' | 'error' | 'stale'> {
    const fid = farmId.value
    if (!fid) return 'stale'
    const seq = ++loadSeq
    const known = current.value?.status === 'ready' || current.value?.status === 'refreshing'
    patch(fid, { filters: next, status: known && opts.silent ? current.value!.status : (known ? 'refreshing' : 'loading') })
    try {
      const res = await api<SalesListResponse>('/api/sales', { query: query(next, SALES_PAGE_SIZE, 0) })
      if (seq !== loadSeq || farmId.value !== fid) return 'stale'
      if (!Array.isArray(res?.sales)) throw new TypeError('bad reply')
      patch(fid, { sales: [...res.sales].sort(compareSalesNewestFirst), total: res.total, hasAny: res.hasAny, status: 'ready' })
      return 'ok'
    }
    catch {
      if (seq !== loadSeq || farmId.value !== fid) return 'stale'
      if (known) patch(fid, { status: 'ready', failures: current.value!.failures + 1 })
      else patch(fid, { status: 'error' })
      return 'error'
    }
  }

  /** A quiet reload with the CURRENT filters (after a mark/void/delete conflict, feature 03's afterFailure pattern). */
  function reload(): Promise<'ok' | 'error' | 'stale'> {
    return load(filters.value, { silent: true })
  }

  /** "Show more" (AC7): fetches the next SALES_PAGE_SIZE rows and appends. Never called for status = pending (AC9). */
  async function loadMore(): Promise<'ok' | 'error'> {
    const fid = farmId.value
    const cur = current.value
    if (!fid || !cur || cur.loadingMore || !hasMore.value) return 'ok'
    patch(fid, { loadingMore: true })
    try {
      const res = await api<SalesListResponse>('/api/sales', { query: query(cur.filters, SALES_PAGE_SIZE, cur.sales.length) })
      if (farmId.value !== fid) return 'ok'
      const seen = new Set(cur.sales.map(s => s.id))
      const merged = [...cur.sales, ...res.sales.filter(s => !seen.has(s.id))].sort(compareSalesNewestFirst)
      patch(fid, { sales: merged, total: res.total, hasAny: res.hasAny, loadingMore: false })
      return 'ok'
    }
    catch {
      if (farmId.value === fid) patch(fid, { loadingMore: false })
      return 'error'
    }
  }

  /** Puts a sale a write just returned into the current page IF it matches the current filters (AC29, AC34, AC40). */
  function upsert(sale: Sale) {
    const fid = farmId.value
    const cur = current.value
    if (!fid || !cur) return
    const idx = cur.sales.findIndex(s => s.id === sale.id)
    const wasPresent = idx !== -1
    const nowMatches = saleMatchesFilters(sale, cur.filters)
    const list = [...cur.sales]
    if (wasPresent) list.splice(idx, 1)
    let total = cur.total
    if (nowMatches) {
      list.push(sale)
      list.sort(compareSalesNewestFirst)
      if (!wasPresent) total += 1
    }
    else if (wasPresent) {
      total = Math.max(0, total - 1)
    }
    patch(fid, { sales: list, total, hasAny: cur.hasAny || !wasPresent })
  }

  /** Removes a sale from the current page for good (Delete, Pending only, AC44). */
  function remove(id: string) {
    const fid = farmId.value
    const cur = current.value
    if (!fid || !cur) return
    const idx = cur.sales.findIndex(s => s.id === id)
    if (idx === -1) return
    const list = [...cur.sales]
    list.splice(idx, 1)
    patch(fid, { sales: list, total: Math.max(0, cur.total - 1) })
  }

  /** True if `sale` is currently showing under the loaded filters (used to decide the "hidden by filter" toast). */
  function isVisible(sale: Sale): boolean {
    return current.value ? saleMatchesFilters(sale, current.value.filters) : false
  }

  /** Drops every `sales:*` key (sign-out does this through useMe().clear()). */
  function reset() {
    clearNuxtState(key => key.startsWith('sales:'))
  }

  return {
    status,
    filters,
    sales,
    total,
    hasAny,
    hasList,
    hasMore,
    loadingMore,
    refreshFailed,
    load,
    reload,
    loadMore,
    upsert,
    remove,
    isVisible,
    reset,
  }
}
