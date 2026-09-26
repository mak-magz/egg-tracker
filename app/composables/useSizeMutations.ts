// Settings > Sizes writes (feature 02 §3.4): add, rename, move, archive, restore. A thin wrapper: the logic
// (in-flight guard, add retry rule, apply the reply, conflict refresh) is in app/utils/size-mutations.ts,
// where tests can drive it with a stubbed `$api`. Each call resolves to { ok, data } | { ok: false, error }
// | null (null: another change is running). On success, and on a conflict reply that carries the list, the
// new list is applied to the farm context, so the Production form, day cards and chart follow with no reload.
import type { SizeApi } from '~/utils/size-mutations'

export function useSizeMutations() {
  const api = useApi()
  const { applySizes, refreshSizes } = useFarm()
  return createSizeMutations({ api: api as SizeApi, applySizes, refresh: refreshSizes })
}
