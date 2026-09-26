// The signed-in farm's settings for the UI: eggs-per-tray and the farm's own size list (feature 01
// §3.4, UX data need 1). Both ride on /api/me (useMe), so they're in the SSR payload and the log
// form opens with no spinner. Never hardcode a tray size or a size list; read them from here.
import type { FarmSize } from '#shared/types/api'
import type { SizeApi } from '~/utils/size-mutations'

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
  const { me, setSizes } = useMe()
  const api = useApi()
  // Counts every applied list, so a slow quiet refresh can't undo a change made meanwhile (see refreshSizes).
  const sizesVersion = useState('farm:sizes-version', () => 0)

  const farm = computed(() => me.value?.farm ?? null)

  /** The farm's tray size (>= 1). Only null when there is no farm, which the shell never renders. */
  const eggsPerTray = computed(() => farm.value?.eggsPerTray ?? null)

  /** ALL sizes (active + archived), in the farm's order (the server sorts them). */
  const sizes = computed<readonly FarmSize[]>(() => farm.value?.sizes ?? [])

  /** Sizes offered for new entries. */
  const activeSizes = computed(() => groupSizes(sizes.value).active)

  /** Retired sizes, in their last order (feature 02). They still label past days. */
  const archivedSizes = computed(() => groupSizes(sizes.value).archived)

  const byId = computed(() => new Map(sizes.value.map(s => [s.id, s])))

  function sizeById(id: string): ResolvedSize {
    const s = byId.value.get(id)
    if (s) return { ...s, known: true }
    // An id we can't resolve sorts last and gets a neutral label.
    return { id, name: 'Unknown size', sortOrder: Number.MAX_SAFE_INTEGER, colorSlot: 0, active: false, known: false }
  }

  /** Puts a new list into the farm context: the Production form, day cards and chart follow at once. */
  function applySizes(list: FarmSize[]) {
    sizesVersion.value++
    setSizes(list)
  }

  /**
   * Quiet re-read of the farm's sizes over GET /api/sizes (feature 02 §3.4). Resolves 'ok' | 'error' and on
   * error changes nothing, so it can never blank the app (it does not go through /api/me). A reply that
   * arrives after another list was applied is dropped.
   */
  function refreshSizes(): Promise<'ok' | 'error'> {
    const started = sizesVersion.value
    return fetchSizes(api as SizeApi, { apply: applySizes, superseded: () => sizesVersion.value !== started })
  }

  return { farm, eggsPerTray, sizes, activeSizes, archivedSizes, sizeById, applySizes, refreshSizes }
}
