// The Production list + chart data (feature 01 §3.4, AC15–AC20, AC27–AC30).
// Owns the range state (chips, from/to), fetches GET /api/production/days through $api, and patches
// the cached list after saves/deletes with no reload. Client-only: ranges depend on the device's
// local "today", which the server can't know, so SSR renders the loading state (AC29, §3.8 D13).
import type { IsoDate, ProductionDay, ProductionDaysResponse } from '#shared/types/api'
import { compareIsoDates } from '#shared/utils/local-date'
import { useEventListener } from '@vueuse/core'
import { createTodayTracker } from '~/utils/today-tracker'
import type { DateRange, RangeChip } from '~/utils/production-range'
import { hasDateRange, isInRange, rangeFor, validateRange } from '~/utils/production-range'

export type ProductionDaysStatus = 'loading' | 'ready' | 'refreshing' | 'error'

export function useProductionDays() {
  const api = useApi()
  const { lastRemoteUpdateAt } = useSync()

  // "Today" is re-read on load, when the page becomes visible again and when the form opens
  // (syncToday), so a screen left open overnight never offers yesterday as today (QA S1).
  const tracker = createTodayTracker()
  const today = ref<IsoDate>(tracker.current)
  const chip = ref<RangeChip>('week')
  const from = ref<IsoDate | null>(null)
  const to = ref<IsoDate | null>(null)

  const rangeError = computed(() => validateRange(from.value, to.value))
  const rangeActive = computed(() => hasDateRange({ from: from.value, to: to.value }))

  /** The range the list/chart currently show (kept while From > To is being fixed). */
  const applied = ref<DateRange>(rangeFor({ chip: chip.value, from: null, to: null }, today.value))

  const status = ref<ProductionDaysStatus>('loading')
  const hasAny = ref(false)
  const days = ref<ProductionDay[]>([])
  /** A refetch (not the first load) failed; the page shows a toast and keeps the content. */
  const refreshFailed = ref(0)

  let seq = 0
  let loadedOnce = false

  async function load(opts: { silent?: boolean } = {}) {
    tracker.refresh()
    today.value = tracker.current
    if (rangeError.value) return
    const range = rangeFor({ chip: chip.value, from: from.value, to: to.value }, today.value)
    const id = ++seq
    if (!loadedOnce) status.value = 'loading'
    else if (!opts.silent) status.value = 'refreshing'
    try {
      const query: Record<string, string> = {}
      if (range.from) query.from = range.from
      if (range.to) query.to = range.to
      const res = await api<ProductionDaysResponse>('/api/production/days', { query })
      if (id !== seq) return
      applied.value = range
      days.value = res.days
      hasAny.value = res.hasAny
      loadedOnce = true
      status.value = 'ready'
    }
    catch {
      if (id !== seq) return
      if (loadedOnce) {
        status.value = 'ready'
        refreshFailed.value++
      }
      else {
        status.value = 'error'
      }
    }
  }

  /**
   * Re-reads the device date. If it rolled over (e.g. the phone slept on this screen past midnight),
   * updates `today` at once and reloads, so Week/Month and "From only" move to the new day.
   * Returns true when the date changed.
   */
  function syncToday(): boolean {
    if (!tracker.refresh()) return false
    today.value = tracker.current
    void load({ silent: true })
    return true
  }

  onMounted(() => {
    void load()
    watch([chip, from, to], () => void load())
    watch(lastRemoteUpdateAt, (val) => {
      if (val && loadedOnce) void load({ silent: true })
    })
  })

  if (import.meta.client) {
    useEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') syncToday()
    })
    useEventListener(window, 'focus', () => syncToday())
  }

  // ---- Filter actions (UX Flow E) ----------------------------------------------------------------
  /** Tapping a chip also clears a set range: one tap back to the chip. */
  function selectChip(value: RangeChip) {
    chip.value = value
    from.value = null
    to.value = null
  }
  function clearDates() {
    from.value = null
    to.value = null
  }
  /** Q1: show one date (a save outside the current filter). */
  function showDate(date: IsoDate) {
    from.value = date
    to.value = date
  }

  // ---- Patches after mutations (no reload) --------------------------------------------------------
  function upsertDay(day: ProductionDay) {
    hasAny.value = true
    if (!isInRange(day.date, applied.value)) return
    const rest = days.value.filter(d => d.date !== day.date)
    days.value = [...rest, day].sort((a, b) => compareIsoDates(b.date, a.date))
  }

  function removeDay(date: IsoDate) {
    days.value = days.value.filter(d => d.date !== date)
    // hasAny may have become false: one silent refetch tells (first use vs empty range).
    if (days.value.length === 0) void load({ silent: true })
  }

  function dateInView(date: IsoDate) {
    return isInRange(date, applied.value)
  }

  return {
    today: readonly(today),
    chip: readonly(chip),
    from,
    to,
    rangeError,
    rangeActive,
    applied: applied as Readonly<Ref<DateRange>>,
    status: readonly(status),
    hasAny: readonly(hasAny),
    days: days as Readonly<Ref<ProductionDay[]>>,
    refreshFailed: readonly(refreshFailed),
    reload: load,
    syncToday,
    selectChip,
    clearDates,
    showDate,
    upsertDay,
    removeDay,
    dateInView,
  }
}
