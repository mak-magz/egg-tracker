// Inventory screen state (feature 06 §3.4). Page-local on purpose, not useState: it dies with the page, so there
// is nothing to clear on sign-out and nothing stale to show. `load()` blanks the data first (skeletons, never old
// numbers: AC16, AC18); a superseded reply or a farm change is ignored.
import type { InventoryResponse } from '#shared/types/api'

export type InventoryLoadStatus = 'loading' | 'ready' | 'error'

export function useInventory() {
  const api = useApi()
  const { farm } = useFarm()
  const { lastRemoteUpdateAt } = useSync()
  const status = ref<InventoryLoadStatus>('loading')
  const data = ref<InventoryResponse | null>(null)
  let seq = 0

  watch(lastRemoteUpdateAt, (val) => {
    if (val && status.value === 'ready') {
      void load()
    }
  })

  async function load(): Promise<void> {
    const fid = farm.value?.id ?? null
    const mine = ++seq
    status.value = 'loading'
    data.value = null
    try {
      const res = await api<InventoryResponse>('/api/inventory')
      if (mine !== seq || (farm.value?.id ?? null) !== fid) return
      if (!res || !Array.isArray(res.sizes)) throw new TypeError('bad reply')
      data.value = res
      status.value = 'ready'
    }
    catch {
      if (mine !== seq || (farm.value?.id ?? null) !== fid) return
      status.value = 'error'
    }
  }

  return { status, data, load }
}
