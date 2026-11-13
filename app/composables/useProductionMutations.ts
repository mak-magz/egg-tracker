// Production writes (feature 01 §3.4): log (add to a day), replace (Edit day), remove (Delete day).
// Each returns { ok, data } or { ok: false, error } and never throws. The in-flight guard means a
// double tap sends one request (AC12): a call made while one is running resolves to null.
import type {
  DeleteProductionDayResponse,
  IsoDate,
  LogProductionRequest,
  LogProductionResponse,
  ProductionAmounts,
  ProductionDay,
  ReplaceProductionDayResponse,
} from '#shared/types/api'
import { useSync } from '~/composables/useSync'
import { mapProductionError } from '~/utils/production-errors'
import type { ProductionError } from '~/utils/production-errors'

/** What a successful form save reports to the page (drives the toast wording and the list patch). */
export interface ProductionSavedEvent {
  kind: 'logged' | 'added' | 'updated'
  day: ProductionDay
}

/**
 * Client timeout for writes (QA N4). A hung request fails into the normal "Couldn't save…" + retry
 * path instead of spinning forever; a retry is safe because the same payload reuses its submissionId.
 */
export const PRODUCTION_WRITE_TIMEOUT_MS = 20_000

export type MutationResult<T> = { ok: true, data: T } | { ok: false, error: ProductionError }

export function useProductionMutations() {
  const api = useApi()
  const { triggerSync } = useSync()
  const pending = ref(false)

  async function run<T>(call: () => Promise<T>): Promise<MutationResult<T> | null> {
    if (pending.value) return null
    pending.value = true
    try {
      const data = await call()
      void triggerSync().catch(() => {})
      return { ok: true, data }
    }
    catch (e) {
      return { ok: false, error: mapProductionError(e) }
    }
    finally {
      pending.value = false
    }
  }

  function log(req: LogProductionRequest) {
    return run(() => api<LogProductionResponse>('/api/production/entries', { method: 'POST', body: req, timeout: PRODUCTION_WRITE_TIMEOUT_MS }))
  }

  function replace(date: IsoDate, amounts: ProductionAmounts) {
    return run(() => api<ReplaceProductionDayResponse>(`/api/production/days/${encodeURIComponent(date)}`, { method: 'PUT', body: amounts, timeout: PRODUCTION_WRITE_TIMEOUT_MS }))
  }

  function remove(date: IsoDate) {
    return run(() => api<DeleteProductionDayResponse>(`/api/production/days/${encodeURIComponent(date)}`, { method: 'DELETE', timeout: PRODUCTION_WRITE_TIMEOUT_MS }))
  }

  return { pending: readonly(pending), log, replace, remove }
}
