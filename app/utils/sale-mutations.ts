// The logic behind useSaleMutations() (feature 04 §3.4), kept free of Nuxt auto-imports so tests/unit can
// drive it with a stubbed `$api`. Every call is one request; each returns { ok, data } | { ok: false, error }
// and never throws (client-mutations.ts's own shape and style).
//
// Guards (UX R1, AC30): create/update share ONE in-flight guard per form instance (a call made while one
// runs resolves to null). Mark delivered / mark as pending / void / delete are guarded PER SALE ID, because
// other rows stay usable while one runs.
// Submission id (AC30): one per form opening, reused on a retry of the SAME normalised payload (type,
// client, dates, every line — NOT `confirmShortfall`, so retrying with "Record anyway" after a shortfall is
// not "a different payload", per §3.1's `sale_submissions.payload_hash`). Replaced when any of those change
// or the form reopens.
import { ref, readonly } from 'vue'
import type {
  CreateSaleRequest,
  CreateSaleResponse,
  DeleteSaleResponse,
  MarkSaleDeliveredRequest,
  Sale,
  SaleChangeResponse,
  SaleLineInput,
  SaleType,
  UpdateSaleRequest,
  VoidSaleRequest,
} from '#shared/types/api'
import { mapSaleError } from './sale-errors'
import type { SaleError } from './sale-errors'

/** Mirrors CLIENT_WRITE_TIMEOUT_MS: a hung request fails into "Couldn't save" + retry rather than spinning forever. */
export const SALE_WRITE_TIMEOUT_MS = 20_000

/** The part of `$api` (a `$fetch` instance) these calls use. */
export type SaleApi = <T>(url: string, opts?: { method?: string, body?: unknown, timeout?: number }) => Promise<T>

export type SaleResult<T> = { ok: true, data: T } | { ok: false, error: SaleError } | null

/** The header + lines, as the form hands them over: already validated and tidied. */
export interface SaleInput {
  type: SaleType
  saleDate: string
  clientId: string | null
  deliveredDate: string | null
  lines: SaleLineInput[]
}

export interface SaleMutationDeps {
  api: SaleApi
  /** Puts a sale a write just returned into the list (useSales().upsert). */
  upsert: (sale: Sale) => void
  /** Removes a sale from the list for good (useSales().remove) — Delete only. */
  removeFromList: (id: string) => void
  /** A quiet re-read with the current filters (useSales().reload). */
  reload: () => Promise<unknown>
  /** Test seam; defaults to crypto.randomUUID. */
  newId?: () => string
}

/** Two payloads are the same intent when type, client, both dates and every line (sorted by size) agree. */
function payloadKey(input: SaleInput): string {
  const lines = [...input.lines]
    .sort((a, b) => a.sizeId.localeCompare(b.sizeId))
    .map(l => [l.sizeId, l.eggs, Math.round(l.pricePerTray * 100)])
  return JSON.stringify([input.type, input.clientId, input.saleDate, input.deliveredDate, lines])
}

export function createSaleSubmissionTracker(newId: () => string = () => crypto.randomUUID()) {
  let id = newId()
  let key: string | null = null
  return {
    reset() {
      id = newId()
      key = null
    },
    idFor(input: SaleInput): string {
      const next = payloadKey(input)
      if (key !== null && key !== next) id = newId()
      key = next
      return id
    },
  }
}

export function createSaleMutations(deps: SaleMutationDeps) {
  const { api, upsert, removeFromList, reload } = deps
  const submissions = createSaleSubmissionTracker(deps.newId)
  /** A create or an update is being saved (one per form). */
  const saving = ref(false)
  /** Ids of the sales whose mark/void/delete is running. */
  const pendingIds = ref<readonly string[]>([])

  /** What to do after a failed write besides telling the owner: keep the list honest (client-mutations.ts's own pattern). */
  function afterFailure(error: SaleError) {
    // Never awaited: the owner's message must not wait on a second request, and a failed read changes nothing.
    if (error.kind === 'sale_changed' || error.kind === 'not_pending' || error.kind === 'not_complete' || error.kind === 'voided') {
      if (error.sale) upsert(error.sale)
      else void reload().catch(() => undefined)
    }
  }

  async function runForm<T extends { sale: Sale }>(call: () => Promise<T>): Promise<SaleResult<T>> {
    if (saving.value) return null
    saving.value = true
    try {
      const data = await call()
      upsert(data.sale)
      return { ok: true, data }
    }
    catch (e) {
      const error = mapSaleError(e)
      afterFailure(error)
      return { ok: false, error }
    }
    finally {
      saving.value = false
    }
  }

  async function runForSale<T extends { sale: Sale }>(id: string, call: () => Promise<T>): Promise<SaleResult<T>> {
    if (pendingIds.value.includes(id)) return null
    pendingIds.value = [...pendingIds.value, id]
    try {
      const data = await call()
      upsert(data.sale)
      return { ok: true, data }
    }
    catch (e) {
      const error = mapSaleError(e)
      afterFailure(error)
      return { ok: false, error }
    }
    finally {
      pendingIds.value = pendingIds.value.filter(x => x !== id)
    }
  }

  async function runDelete(id: string, call: () => Promise<DeleteSaleResponse>): Promise<SaleResult<DeleteSaleResponse>> {
    if (pendingIds.value.includes(id)) return null
    pendingIds.value = [...pendingIds.value, id]
    try {
      const data = await call()
      removeFromList(id)
      return { ok: true, data }
    }
    catch (e) {
      const error = mapSaleError(e)
      // A 404 (already gone elsewhere): nothing was ever there to keep, and the caller treats it as done.
      if (error.kind !== 'not_found') afterFailure(error)
      return { ok: false, error }
    }
    finally {
      pendingIds.value = pendingIds.value.filter(x => x !== id)
    }
  }

  const path = (id: string) => `/api/sales/${encodeURIComponent(id)}`

  return {
    saving: readonly(saving),
    pendingIds: readonly(pendingIds),
    /** Call when a form opens: the next create gets a fresh submission id. */
    resetCreate: () => submissions.reset(),
    create(input: SaleInput, confirmShortfall = false) {
      const body: CreateSaleRequest = { submissionId: submissions.idFor(input), ...input, confirmShortfall }
      return runForm<CreateSaleResponse>(() => api<CreateSaleResponse>('/api/sales', { method: 'POST', body, timeout: SALE_WRITE_TIMEOUT_MS }))
    },
    /** Replaces the whole sale, sending back the version the form was opened with (AC43). */
    update(sale: Pick<Sale, 'id' | 'version'>, input: SaleInput, confirmShortfall = false) {
      const body: UpdateSaleRequest = { version: sale.version, ...input, confirmShortfall }
      return runForm<SaleChangeResponse>(() => api<SaleChangeResponse>(path(sale.id), { method: 'PUT', body, timeout: SALE_WRITE_TIMEOUT_MS }))
    },
    markDelivered(id: string, deliveredDate: string, confirmShortfall = false) {
      const body: MarkSaleDeliveredRequest = { deliveredDate, confirmShortfall }
      return runForSale(id, () => api<SaleChangeResponse>(`${path(id)}/mark-delivered`, { method: 'POST', body, timeout: SALE_WRITE_TIMEOUT_MS }))
    },
    markPending(id: string) {
      return runForSale(id, () => api<SaleChangeResponse>(`${path(id)}/mark-pending`, { method: 'POST', timeout: SALE_WRITE_TIMEOUT_MS }))
    },
    voidSale(sale: Pick<Sale, 'id' | 'version'>) {
      const body: VoidSaleRequest = { version: sale.version }
      return runForSale(sale.id, () => api<SaleChangeResponse>(`${path(sale.id)}/void`, { method: 'POST', body, timeout: SALE_WRITE_TIMEOUT_MS }))
    },
    remove(id: string) {
      return runDelete(id, () => api<DeleteSaleResponse>(path(id), { method: 'DELETE', timeout: SALE_WRITE_TIMEOUT_MS }))
    },
  }
}
