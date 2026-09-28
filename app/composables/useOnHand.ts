// A small keyed cache of "eggs on hand, per size" (feature 04 §3.4, AC25). Backed by GET /api/sales/on-hand,
// invalidated (refetched) after every successful create/edit/mark-delivered/mark-pending/delete/void. The
// form's per-line hint reads this cache OPTIMISTICALLY; the authoritative check is always the server's at
// Save / Mark-delivered time (X5) — this cache is never trusted for the shortfall decision itself.
// Not personal data (no client/price/quantity content), but kept in useState('on-hand:state') anyway so it
// is cleared with the rest of a farm's session state on sign-out / farm switch, for consistency.
import type { OnHandResponse } from '#shared/types/api'

interface OnHandEntry { status: 'loading' | 'ready' | 'error', eggs: number | null }
interface OnHandState { farmId: string, bySize: Record<string, OnHandEntry> }

export function useOnHand() {
  const api = useApi()
  const { farm } = useFarm()
  const farmId = computed(() => farm.value?.id ?? null)
  const state = useState<OnHandState | null>('on-hand:state', () => null)

  const current = computed(() => (state.value && state.value.farmId === farmId.value ? state.value : null))

  function patch(fid: string, bySize: Record<string, OnHandEntry>) {
    const base = current.value ?? { farmId: fid, bySize: {} }
    state.value = { farmId: fid, bySize: { ...base.bySize, ...bySize } }
  }

  function entry(sizeId: string): OnHandEntry {
    return current.value?.bySize[sizeId] ?? { status: 'loading', eggs: null }
  }

  /** Fetches (or refetches) on-hand for the given sizes. Safe to call with an empty/duplicate list. */
  async function ensure(sizeIds: readonly string[]): Promise<void> {
    const fid = farmId.value
    const ids = [...new Set(sizeIds)].filter(Boolean)
    if (!fid || ids.length === 0) return
    patch(fid, Object.fromEntries(ids.map(id => [id, { status: 'loading' as const, eggs: entry(id).eggs }])))
    try {
      const res = await api<OnHandResponse>('/api/sales/on-hand', { query: { sizeId: ids } })
      if (farmId.value !== fid) return
      const bySize = Object.fromEntries(res.onHand.map(line => [line.sizeId, { status: 'ready' as const, eggs: line.eggs }]))
      patch(fid, bySize)
    }
    catch {
      if (farmId.value !== fid) return
      patch(fid, Object.fromEntries(ids.map(id => [id, { status: 'error' as const, eggs: entry(id).eggs }])))
    }
  }

  /** Re-fetches on-hand for the sizes a change touched (AC25, AC29, AC53). */
  function invalidate(sizeIds: readonly string[]): Promise<void> {
    return ensure(sizeIds)
  }

  function reset() {
    clearNuxtState(key => key.startsWith('on-hand:'))
  }

  return { entry, ensure, invalidate, reset }
}
