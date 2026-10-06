// The logic behind useOrderMutations() (feature 05 §3.5), kept free of Nuxt auto-imports so tests/unit can drive it
// with a stubbed `$api`. Every call is one request; each returns { ok, data } | { ok: false, error } and never
// throws (sale-mutations.ts's own shape and style).
//
// Guards (O-R1, AC16, AC31): create/update share ONE in-flight guard per form instance (a call made while one runs
// resolves to null). Status moves, Cancel, Close short and Deliver are guarded PER ORDER ID, because other cards stay
// usable while one runs.
// Submission ids (AC16, AC31): one per form / Deliver-step opening, reused on a retry of the SAME normalised payload
// (client, dates, every line; for Deliver the order, the date and every line, but NOT `confirmShortfall`, so "Deliver
// anyway" is the same request). Replaced when any of those change or the step reopens.
import { readonly, ref } from 'vue'
import type {
  CloseOrderRequest,
  CreateOrderRequest,
  CreateOrderResponse,
  DeliverOrderRequest,
  DeliverOrderResponse,
  IsoDate,
  Order,
  OrderChangeResponse,
  OrderDetail,
  OrderLineInput,
  OrderManualStatus,
  SetOrderStatusRequest,
  UpdateOrderRequest,
} from '#shared/types/api'
import { errorCarriesOrder, mapOrderError } from './order-errors'
import type { OrderError } from './order-errors'

/** Mirrors SALE_WRITE_TIMEOUT_MS: a hung request fails into "Couldn't save" + retry rather than spinning forever. */
export const ORDER_WRITE_TIMEOUT_MS = 20_000

/** The part of `$api` (a `$fetch` instance) these calls use. */
export type OrderApi = <T>(url: string, opts?: { method?: string, body?: unknown, timeout?: number }) => Promise<T>

export type OrderResult<T> = { ok: true, data: T } | { ok: false, error: OrderError } | null

/** The header + lines, as the form hands them over: already validated and tidied. */
export interface OrderInput {
  clientId: string
  orderDate: IsoDate
  wantedBy: IsoDate | null
  lines: OrderLineInput[]
}

/** What one delivery sends: the date and the lines with eggs to deliver now (zero lines left out). */
export interface DeliverInput {
  deliveredDate: IsoDate
  lines: { sizeId: string, eggs: number }[]
}

export interface OrderMutationDeps {
  api: OrderApi
  /** Puts an order a write just returned into the list (useOrders().upsert). */
  upsert: (order: Order) => void
  /** A quiet re-read with the current filters (useOrders().reload). */
  reload: () => Promise<unknown>
  /** Test seam; defaults to crypto.randomUUID. */
  newId?: () => string
}

function sortedLines<T extends { sizeId: string }>(lines: readonly T[]): T[] {
  return [...lines].sort((a, b) => a.sizeId.localeCompare(b.sizeId))
}

/** Two payloads are the same intent when client, both dates and every line (sorted by size) agree. */
export function orderPayloadKey(input: OrderInput): string {
  const lines = sortedLines(input.lines).map(l => [l.sizeId, l.eggs, Math.round(l.pricePerTray * 100)])
  return JSON.stringify([input.clientId, input.orderDate, input.wantedBy, lines])
}

/** Two deliveries are the same intent when the order, the date and every line agree. */
export function deliverPayloadKey(orderId: string, input: DeliverInput): string {
  return JSON.stringify([orderId, input.deliveredDate, sortedLines(input.lines).map(l => [l.sizeId, l.eggs])])
}

export function createOrderSubmissionTracker(newId: () => string = () => crypto.randomUUID()) {
  let id = newId()
  let key: string | null = null
  return {
    reset() {
      id = newId()
      key = null
    },
    idFor(next: string): string {
      if (key !== null && key !== next) id = newId()
      key = next
      return id
    },
  }
}

export function createOrderMutations(deps: OrderMutationDeps) {
  const { api, upsert, reload } = deps
  const createIds = createOrderSubmissionTracker(deps.newId)
  const deliverIds = createOrderSubmissionTracker(deps.newId)
  /** A create or an update is being saved (one per form). */
  const saving = ref(false)
  /** Ids of the orders whose status move / cancel / close short / deliver is running. */
  const pendingIds = ref<readonly string[]>([])

  /** What to do after a failed write besides telling the owner: keep the list honest. */
  function afterFailure(error: OrderError) {
    if (!errorCarriesOrder(error.kind)) return
    // Never awaited: the owner's message must not wait on a second request, and a failed read changes nothing.
    if (error.order) upsert(error.order)
    else void reload().catch(() => undefined)
  }

  async function runForm<T extends { order: OrderDetail }>(call: () => Promise<T>): Promise<OrderResult<T>> {
    if (saving.value) return null
    saving.value = true
    try {
      const data = await call()
      upsert(data.order)
      return { ok: true, data }
    }
    catch (e) {
      const error = mapOrderError(e)
      afterFailure(error)
      return { ok: false, error }
    }
    finally {
      saving.value = false
    }
  }

  async function runForOrder<T extends { order: OrderDetail }>(id: string, call: () => Promise<T>): Promise<OrderResult<T>> {
    if (pendingIds.value.includes(id)) return null
    pendingIds.value = [...pendingIds.value, id]
    try {
      const data = await call()
      upsert(data.order)
      return { ok: true, data }
    }
    catch (e) {
      const error = mapOrderError(e)
      afterFailure(error)
      return { ok: false, error }
    }
    finally {
      pendingIds.value = pendingIds.value.filter(x => x !== id)
    }
  }

  const path = (id: string) => `/api/orders/${encodeURIComponent(id)}`

  return {
    saving: readonly(saving),
    pendingIds: readonly(pendingIds),
    /** Call when the New order form opens: the next create gets a fresh submission id. */
    resetCreate: () => createIds.reset(),
    /** Call when the Deliver step opens: the next delivery gets a fresh submission id. */
    resetDeliver: () => deliverIds.reset(),
    create(input: OrderInput) {
      const body: CreateOrderRequest = { submissionId: createIds.idFor(orderPayloadKey(input)), ...input }
      return runForm<CreateOrderResponse>(() => api<CreateOrderResponse>('/api/orders', { method: 'POST', body, timeout: ORDER_WRITE_TIMEOUT_MS }))
    },
    /** Replaces the whole order, sending back the version the form was opened with (AC20). */
    update(order: Pick<Order, 'id' | 'version'>, input: OrderInput) {
      const body: UpdateOrderRequest = { version: order.version, ...input }
      return runForm<OrderChangeResponse>(() => api<OrderChangeResponse>(path(order.id), { method: 'PUT', body, timeout: ORDER_WRITE_TIMEOUT_MS }))
    },
    setStatus(id: string, status: OrderManualStatus) {
      const body: SetOrderStatusRequest = { status }
      return runForOrder(id, () => api<OrderChangeResponse>(`${path(id)}/status`, { method: 'POST', body, timeout: ORDER_WRITE_TIMEOUT_MS }))
    },
    cancel(id: string) {
      return runForOrder(id, () => api<OrderChangeResponse>(`${path(id)}/cancel`, { method: 'POST', timeout: ORDER_WRITE_TIMEOUT_MS }))
    },
    /** Close short is one-way, so it acts on the version the confirm dialog was built from (AC34). */
    closeShort(order: Pick<Order, 'id' | 'version'>) {
      const body: CloseOrderRequest = { version: order.version }
      return runForOrder(order.id, () => api<OrderChangeResponse>(`${path(order.id)}/close`, { method: 'POST', body, timeout: ORDER_WRITE_TIMEOUT_MS }))
    },
    deliver(id: string, input: DeliverInput, confirmShortfall = false) {
      const body: DeliverOrderRequest = {
        submissionId: deliverIds.idFor(deliverPayloadKey(id, input)),
        deliveredDate: input.deliveredDate,
        lines: input.lines,
        confirmShortfall,
      }
      return runForOrder<DeliverOrderResponse>(id, () => api<DeliverOrderResponse>(`${path(id)}/deliver`, { method: 'POST', body, timeout: ORDER_WRITE_TIMEOUT_MS }))
    },
  }
}
