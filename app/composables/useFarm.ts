// The signed-in farm's settings for the UI: eggs-per-tray, the farm's own size list (feature 01 §3.4,
// UX data need 1) and its currency (feature 03 AC35). All ride on /api/me (useMe), so they're in the SSR
// payload and the forms open with no spinner. Never hardcode a tray size, a size list or a currency
// symbol; read them from here.
import type { FarmSize, FarmSummary } from '#shared/types/api'
import { DEFAULT_CURRENCY } from '#shared/constants/currency'
import { currencySymbol as symbolFor, formatPrice as formatPriceIn } from '#shared/utils/price'
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

const DEFAULT_FARM_SIZES: FarmSize[] = [
  { id: 'size-small', name: 'Small', sortOrder: 0, colorSlot: 0, active: true },
  { id: 'size-medium', name: 'Medium', sortOrder: 1, colorSlot: 1, active: true },
  { id: 'size-large', name: 'Large', sortOrder: 2, colorSlot: 2, active: true },
  { id: 'size-jumbo', name: 'Jumbo', sortOrder: 3, colorSlot: 3, active: true },
]

const DEFAULT_FARM: FarmSummary = {
  id: 'local-farm',
  name: 'My Farm',
  eggsPerTray: 30,
  currency: DEFAULT_CURRENCY,
  sizes: DEFAULT_FARM_SIZES,
}

export function useFarm() {
  const { me, ensure, setSizes } = useMe()
  const api = useApi()
  // Counts every applied list, so a slow quiet refresh can't undo a change made meanwhile (see refreshSizes).
  const sizesVersion = useState('farm:sizes-version', () => 0)

  if (import.meta.client && !me.value) {
    void ensure().catch(() => {})
  }

  const farm = computed(() => me.value?.farm ?? DEFAULT_FARM)

  /** The farm's tray size (>= 1). Falls back to 30 for local offline farm. */
  const eggsPerTray = computed(() => farm.value?.eggsPerTray ?? 30)

  /**
   * The tray size as a plain number for formatting, so a template never writes a fallback literal.
   */
  const trayEggs = computed(() => eggsPerTray.value ?? 30)

  /**
   * The farm's ISO currency code (feature 03). Falls back to the default only when there is no farm; an unknown
   * code is handled by formatPrice / currencySymbol themselves (they show the default's symbol, AC36).
   */
  const currency = computed(() => farm.value?.currency ?? DEFAULT_CURRENCY)

  /** The symbol for the price field's prefix (`₱`). Never typed into a screen. */
  const currencySymbol = computed(() => symbolFor(currency.value))

  /** A price in the farm's currency: `₱250.00`, `₱1,250.00`. The one rule for every price (AC36). Never converts. */
  function formatPrice(amount: number): string {
    return formatPriceIn(amount, currency.value)
  }

  /** ALL sizes (active + archived), in the farm's order (the server sorts them). */
  const sizes = computed<readonly FarmSize[]>(() => {
    const list = farm.value?.sizes
    if (list && list.length > 0) return list
    return DEFAULT_FARM_SIZES
  })

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

  return { farm, eggsPerTray, trayEggs, currency, currencySymbol, formatPrice, sizes, activeSizes, archivedSizes, sizeById, applySizes, refreshSizes }
}
