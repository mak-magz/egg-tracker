// One day's totals by date, for any date (feature 01 §3.4, UX data need 5): the AC8 "adds to" note.
// Silent: no spinner, and a failed lookup simply shows no note. Debounced while the date input changes.
import type { IsoDate, ProductionDay, ProductionDayResponse } from '#shared/types/api'
import { isIsoDate } from '#shared/utils/local-date'

/** GET /api/production/days/:date. `undefined` when the lookup failed. */
export async function fetchProductionDay(api: ReturnType<typeof useApi>, date: IsoDate): Promise<ProductionDay | null | undefined> {
  try {
    const res = await api<ProductionDayResponse>(`/api/production/days/${encodeURIComponent(date)}`)
    return res.day
  }
  catch {
    return undefined
  }
}

/**
 * Watches `date` (only while `enabled`) and exposes that day's totals, or null when it has none.
 * `refresh()` re-queries now (after a failed save, so a lost attempt that did land shows up).
 */
export function useProductionDay(date: Ref<IsoDate>, enabled: Ref<boolean>, opts: { maxDate: Ref<IsoDate> }) {
  const api = useApi()
  const day = ref<ProductionDay | null>(null)
  let seq = 0

  async function load() {
    const d = date.value
    const id = ++seq
    if (!enabled.value || !isIsoDate(d) || d > opts.maxDate.value) {
      day.value = null
      return
    }
    const result = await fetchProductionDay(api, d)
    if (id !== seq) return // a newer date was picked meanwhile
    day.value = result ?? null
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  watch([date, enabled], () => {
    clearTimeout(timer)
    // Hide a note for the previous date straight away; show the new one once known.
    if (day.value && day.value.date !== date.value) day.value = null
    timer = setTimeout(load, 250)
  }, { immediate: true })
  onScopeDispose(() => clearTimeout(timer))

  return { day: readonly(day), refresh: load }
}
