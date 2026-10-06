// The one owner of the farm's (current window of) orders (feature 05 §3.5). Like useSales it is filtered on the
// server; unlike useSales the Open view is NOT paged: it holds every open order (AC5) and the other views page 25
// at a time (AC49). `hasAny` tells first use (AC6) from no match.
//
// State lives in useState('orders:state'), keyed by farm id (state for another farm is ignored, and
// useMe().clear() drops every `orders:*` key on sign-out, AC55). An order carries only `clientId`, never a client's
// name (AC53): names are joined client-side from useClients().
import type { Order, OrdersListResponse } from '#shared/types/api'
import { compareOrdersFor, defaultOrdersFilters, orderMatchesFilters, ordersQuery } from '~/utils/order-list'
import type { OrdersFilters } from '~/utils/order-list'

export type OrdersLoadStatus = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error'

interface OrdersState {
  farmId: string
  status: OrdersLoadStatus
  filters: OrdersFilters
  hasAny: boolean
  total: number
  orders: Order[]
  loadingMore: boolean
  /** Counts failed quiet refreshes; the page toasts on each. */
  failures: number
}

let loadSeq = 0

export function useOrders() {
  const api = useApi()
  const { farm } = useFarm()
  const farmId = computed(() => farm.value?.id ?? null)
  const state = useState<OrdersState | null>('orders:state', () => null)

  const current = computed(() => (state.value && state.value.farmId === farmId.value ? state.value : null))

  const status = computed<OrdersLoadStatus>(() => current.value?.status ?? 'idle')
  const filters = computed(() => current.value?.filters ?? defaultOrdersFilters())
  const orders = computed<readonly Order[]>(() => current.value?.orders ?? [])
  const total = computed(() => current.value?.total ?? 0)
  const hasAny = computed(() => current.value?.hasAny ?? false)
  const loadingMore = computed(() => current.value?.loadingMore ?? false)
  const refreshFailed = computed(() => current.value?.failures ?? 0)
  /** The list is known (loaded, maybe refreshing): show it, never the loading placeholder. */
  const hasList = computed(() => status.value === 'ready' || status.value === 'refreshing')
  /** Open holds everything; only the other views have a "Show more" (AC5). */
  const hasMore = computed(() => filters.value.view !== 'open' && orders.value.length < total.value)

  function patch(farmIdNow: string, change: Partial<Omit<OrdersState, 'farmId'>>) {
    const base: OrdersState = current.value ?? {
      farmId: farmIdNow,
      status: 'idle',
      filters: defaultOrdersFilters(),
      hasAny: false,
      total: 0,
      orders: [],
      loadingMore: false,
      failures: 0,
    }
    state.value = { ...base, ...change }
  }

  /** GET /api/orders with `next`, replacing the current page. Resolves 'ok' | 'error' | 'stale'. */
  async function load(next: OrdersFilters, opts: { silent?: boolean } = {}): Promise<'ok' | 'error' | 'stale'> {
    const fid = farmId.value
    if (!fid) return 'stale'
    const seq = ++loadSeq
    const known = current.value?.status === 'ready' || current.value?.status === 'refreshing'
    patch(fid, { filters: next, status: known && opts.silent ? current.value!.status : (known ? 'refreshing' : 'loading') })
    try {
      const res = await api<OrdersListResponse>('/api/orders', { query: ordersQuery(next) })
      if (seq !== loadSeq || farmId.value !== fid) return 'stale'
      if (!Array.isArray(res?.orders)) throw new TypeError('bad reply')
      patch(fid, { orders: [...res.orders].sort(compareOrdersFor(next.view)), total: res.total, hasAny: res.hasAny, status: 'ready' })
      return 'ok'
    }
    catch {
      if (seq !== loadSeq || farmId.value !== fid) return 'stale'
      if (known) patch(fid, { status: 'ready', failures: current.value!.failures + 1 })
      else patch(fid, { status: 'error' })
      return 'error'
    }
  }

  /** A quiet reload with the CURRENT filters (after a stale or refused change). */
  function reload(): Promise<'ok' | 'error' | 'stale'> {
    return load(filters.value, { silent: true })
  }

  /** "Show more" (AC49): the next page of a non-Open view, appended. */
  async function loadMore(): Promise<'ok' | 'error'> {
    const fid = farmId.value
    const cur = current.value
    if (!fid || !cur || cur.loadingMore || !hasMore.value) return 'ok'
    patch(fid, { loadingMore: true })
    try {
      const res = await api<OrdersListResponse>('/api/orders', { query: ordersQuery(cur.filters, cur.orders.length) })
      if (farmId.value !== fid) return 'ok'
      const seen = new Set(cur.orders.map(o => o.id))
      const merged = [...cur.orders, ...res.orders.filter(o => !seen.has(o.id))].sort(compareOrdersFor(cur.filters.view))
      patch(fid, { orders: merged, total: res.total, hasAny: res.hasAny, loadingMore: false })
      return 'ok'
    }
    catch {
      if (farmId.value === fid) patch(fid, { loadingMore: false })
      return 'error'
    }
  }

  /** Puts an order a write just returned into the current page IF it matches the current filters. */
  function upsert(order: Order) {
    const fid = farmId.value
    const cur = current.value
    if (!fid || !cur) return
    const idx = cur.orders.findIndex(o => o.id === order.id)
    const wasPresent = idx !== -1
    const nowMatches = orderMatchesFilters(order, cur.filters)
    const list = [...cur.orders]
    if (wasPresent) list.splice(idx, 1)
    let totalNow = cur.total
    if (nowMatches) {
      list.push(order)
      list.sort(compareOrdersFor(cur.filters.view))
      if (!wasPresent) totalNow += 1
    }
    else if (wasPresent) {
      totalNow = Math.max(0, totalNow - 1)
    }
    patch(fid, { orders: list, total: totalNow, hasAny: cur.hasAny || !wasPresent })
  }

  /** True if `order` is showing under the loaded filters (decides the "Hidden by the Open filter" toast). */
  function isVisible(order: Pick<Order, 'status' | 'clientId' | 'orderDate'>): boolean {
    return current.value ? orderMatchesFilters(order, current.value.filters) : false
  }

  /** Drops every `orders:*` key (sign-out does this through useMe().clear()). */
  function reset() {
    clearNuxtState(key => key.startsWith('orders:'))
  }

  return {
    status,
    filters,
    orders,
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
    isVisible,
    reset,
  }
}

export type OrdersList = ReturnType<typeof useOrders>
