// The logic behind useSizeMutations() and useFarm().refreshSizes() (feature 02 §3.4), kept free of Nuxt
// auto-imports so tests/unit can drive it with a stubbed `$api`. Every call is one request; each write
// returns { ok, data } or { ok: false, error } and never throws. One in-flight guard for the whole
// Sizes card: a call made while another runs resolves to null, so a double tap can't add two sizes or
// move a size two steps (AC18).
import { ref, readonly } from 'vue'
import type {
  AddSizeRequest,
  FarmSize,
  RenameSizeRequest,
  ReorderSizesRequest,
  SizeChangeResponse,
  SizesResponse,
} from '#shared/types/api'
import { normalizeSizeName } from '#shared/utils/size-name'
import { mapSizeError } from './size-errors'
import type { SizeError } from './size-errors'

/**
 * Client timeout for writes and the refresh. A hung request fails into the normal "Couldn't save" + retry
 * path instead of spinning forever; a retry is safe (add reuses its submissionId; the other calls are
 * idempotent by design: feature 02 §3.1).
 */
export const SIZE_WRITE_TIMEOUT_MS = 20_000

export type SizeAction = 'add' | 'rename' | 'move' | 'archive' | 'restore'

/** What is being saved right now: drives the spinner on one control and the disabled state of the rest. */
export interface PendingSizeChange {
  action: SizeAction
  /** The size the action is on. Null for `add`. */
  sizeId: string | null
}

/** The part of `$api` (a `$fetch` instance) these calls use. */
export type SizeApi = <T>(url: string, opts?: { method?: string, body?: unknown, timeout?: number }) => Promise<T>

/** `null` = another change was already running, so nothing was sent. */
export type SizeMutationResult = { ok: true, data: SizeChangeResponse } | { ok: false, error: SizeError } | null

export interface SizeMutationDeps {
  api: SizeApi
  /** Puts the farm's new size list into the farm context (useFarm().applySizes). */
  applySizes: (sizes: FarmSize[]) => void
  /** A quiet re-read, used when a conflict reply carries no list (useFarm().refreshSizes). */
  refresh: () => Promise<unknown>
  /** Test seam; defaults to crypto.randomUUID. */
  newId?: () => string
}

/**
 * The Add retry rule (feature 01 §3.4, feature 02 §3.4): one submission id per form opening, reused on a
 * retry of the SAME normalised name, replaced when the name changes. `reset()` on every form opening.
 */
export function createSubmissionTracker(newId: () => string = () => crypto.randomUUID()) {
  let id = newId()
  let name: string | null = null
  return {
    reset() {
      id = newId()
      name = null
    },
    idFor(rawName: string): string {
      const normalised = normalizeSizeName(rawName)
      if (name !== null && name !== normalised) id = newId()
      name = normalised
      return id
    },
  }
}

export function createSizeMutations(deps: SizeMutationDeps) {
  const { api, applySizes, refresh } = deps
  const submissions = createSubmissionTracker(deps.newId)
  const pending = ref<PendingSizeChange | null>(null)

  async function run(action: SizeAction, sizeId: string | null, call: () => Promise<SizeChangeResponse>): Promise<SizeMutationResult> {
    if (pending.value) return null
    pending.value = { action, sizeId }
    try {
      const data = await call()
      applySizes(data.sizes)
      return { ok: true, data }
    }
    catch (e) {
      const error = mapSizeError(e)
      // A conflict reply carries the current list: show it. If it doesn't, read it ourselves.
      if (error.sizes) applySizes(error.sizes)
      else if (error.kind === 'stale' || error.kind === 'last_active') await refresh().catch(() => undefined)
      // A name clash goes back to the form at once (the message must not wait on a second request), but the
      // list catches up in the background: the size that holds the name may have been made elsewhere.
      else if (error.kind === 'name_taken') void refresh().catch(() => undefined)
      return { ok: false, error }
    }
    finally {
      pending.value = null
    }
  }

  const path = (id: string) => `/api/sizes/${encodeURIComponent(id)}`

  return {
    pending: readonly(pending),
    /** Call when the Add form opens: the next add gets a fresh submission id. */
    resetAdd: () => submissions.reset(),
    /** `name` as typed; the id follows the retry rule. The server normalises the name again. */
    add(name: string, defaultPrice?: number | null) {
      const body: AddSizeRequest = { submissionId: submissions.idFor(name), name, defaultPrice }
      return run('add', null, () => api<SizeChangeResponse>('/api/sizes', { method: 'POST', body, timeout: SIZE_WRITE_TIMEOUT_MS }))
    },
    rename(id: string, name: string, defaultPrice?: number | null) {
      const body: RenameSizeRequest = { name, defaultPrice }
      return run('rename', id, () => api<SizeChangeResponse>(path(id), { method: 'PATCH', body, timeout: SIZE_WRITE_TIMEOUT_MS }))
    },
    /** `order` is the wanted FULL order of the active sizes (moveInOrder), never a step. */
    move(sizeId: string, order: string[]) {
      const body: ReorderSizesRequest = { sizeId, order }
      return run('move', sizeId, () => api<SizeChangeResponse>('/api/sizes/order', { method: 'PUT', body, timeout: SIZE_WRITE_TIMEOUT_MS }))
    },
    archive(id: string) {
      return run('archive', id, () => api<SizeChangeResponse>(`${path(id)}/archive`, { method: 'POST', timeout: SIZE_WRITE_TIMEOUT_MS }))
    },
    restore(id: string) {
      return run('restore', id, () => api<SizeChangeResponse>(`${path(id)}/restore`, { method: 'POST', timeout: SIZE_WRITE_TIMEOUT_MS }))
    },
  }
}

/**
 * GET /api/sizes, then `apply`. Resolves 'ok' | 'error' and NEVER throws or touches anything on error, so a
 * failed quiet refresh can't blank the app (feature 02 §3.4). `superseded()` is checked after the reply: if
 * a newer list was applied while this request was out (a change made on this screen), the older reply is
 * dropped instead of undoing it.
 */
export async function fetchSizes(
  api: SizeApi,
  opts: { apply: (sizes: FarmSize[]) => void, superseded?: () => boolean },
): Promise<'ok' | 'error'> {
  try {
    const res = await api<SizesResponse>('/api/sizes', { timeout: SIZE_WRITE_TIMEOUT_MS })
    if (!Array.isArray(res?.sizes)) return 'error'
    if (!opts.superseded?.()) opts.apply(res.sizes)
    return 'ok'
  }
  catch {
    return 'error'
  }
}
