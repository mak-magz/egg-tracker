// The signed-in farm's settings for the UI: eggs-per-tray and the farm's own size list (feature 01
// §3.4, UX data need 1). Both ride on /api/me (useMe), so they're in the SSR payload and the log
// form opens with no spinner. Never hardcode a tray size or a size list; read them from here.
import type { FarmSize } from '#shared/types/api'

export interface ResolvedSize {
  id: string
  name: string
  sortOrder: number
  colorSlot: number
  active: boolean
  /** false for an id that isn't in the farm's list (shouldn't happen; shown as "Unknown size"). */
  known: boolean
}

export function useFarm() {
  const { me, ensure } = useMe()

  const farm = computed(() => me.value?.farm ?? null)

  /** The farm's tray size (>= 1). Only null when there is no farm, which the shell never renders. */
  const eggsPerTray = computed(() => farm.value?.eggsPerTray ?? null)

  /** ALL sizes (active + archived), in the farm's order (the server sorts them). */
  const sizes = computed<readonly FarmSize[]>(() => farm.value?.sizes ?? [])

  /** Sizes offered for new entries. */
  const activeSizes = computed(() => sizes.value.filter(s => s.active))

  const byId = computed(() => new Map(sizes.value.map(s => [s.id, s])))

  function sizeById(id: string): ResolvedSize {
    const s = byId.value.get(id)
    if (s) return { ...s, known: true }
    // An id we can't resolve sorts last and gets a neutral label.
    return { id, name: 'Unknown size', sortOrder: Number.MAX_SAFE_INTEGER, colorSlot: 0, active: false, known: false }
  }

  /** Re-read /api/me, e.g. after the server said the sizes changed. */
  function refreshSizes() {
    return ensure({ force: true })
  }

  return { farm, eggsPerTray, sizes, activeSizes, sizeById, refreshSizes }
}
