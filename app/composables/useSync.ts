import { computed, readonly, ref } from 'vue'
import { syncEngine, type SyncStatus } from '../local/sync'

const globalSyncStatus = ref<SyncStatus>(syncEngine.getState().status)
const globalPendingOutboxCount = ref<number>(syncEngine.getState().pendingCount)
const globalLastSyncedAt = ref<string | null>(syncEngine.getState().lastSyncedAt)
const globalLastError = ref<string | null>(syncEngine.getState().lastError)

let isSubscribed = false

function ensureSubscribed() {
  if (isSubscribed || typeof window === 'undefined') return
  isSubscribed = true
  syncEngine.subscribe((state) => {
    globalSyncStatus.value = state.status
    globalPendingOutboxCount.value = state.pendingCount
    globalLastSyncedAt.value = state.lastSyncedAt
    globalLastError.value = state.lastError
  })
}

export function useSync() {
  ensureSubscribed()

  function triggerSync() {
    return syncEngine.triggerSync()
  }

  return {
    syncStatus: readonly(globalSyncStatus),
    pendingOutboxCount: readonly(globalPendingOutboxCount),
    lastSyncedAt: readonly(globalLastSyncedAt),
    lastError: readonly(globalLastError),
    isSyncing: computed(() => globalSyncStatus.value === 'syncing'),
    triggerSync,
    syncEngine,
  }
}
